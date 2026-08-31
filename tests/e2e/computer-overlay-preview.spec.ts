import { test, expect } from "./fixtures/studio";
import { installImageAttachmentScenario } from "./fixtures/image-attachments";

test("debug command previews the real overlay without native capture, permission or input", async ({ launchStudio, mockBackend }) => {
  test.skip(process.platform !== "win32");
  const { timelines } = installImageAttachmentScenario(mockBackend);
  mockBackend.setHandler("ai.chat", ({ id, params, connectionId }) => {
    const message = (params as { message: string }).message;
    const action = message.trim().split(/\s+/)[1] ?? "running";
    const sessionId = "session-history", runId = `slash-${id}`;
    timelines.set(sessionId, [{
      id, type: "assistant", requestId: id, content: "Preview fixture", completionStatus: "responded",
      startedAtUtc: "2026-08-30T00:00:00.000Z", completedAtUtc: "2026-08-30T00:00:00.000Z",
      bodyParts: [{ type: "markdown", text: "Preview fixture" }],
    }]);
    mockBackend.sendEvent("agent.run.state", {
      schemaVersion: 1, revision: 1, stage: "completed", lane: "direct", intent: "answer", scope: "bounded",
      runId, requestId: id, rootRequestId: id, title: "Preview fixture", planId: null, todo: null, pause: null,
      verificationStatus: null, warnings: [], checkpoint: { successfulWriteFingerprints: [], evidence: [] },
      terminal: { resultStatus: "completed", completedAt: "2026-08-30T00:00:00.000Z" },
      createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z",
    }, { sessionId, requestId: id, runId });
    return { text: "Preview fixture", computerOverlayPreview: { connectionId, sessionId, requestId: id, action } };
  });
  const { mainWindow, electronApp } = await launchStudio();
  await electronApp.evaluate(({ desktopCapturer }) => {
    const cp = process.getBuiltinModule("child_process"), spawn = cp.spawn;
    (globalThis as any).previewNativeStarts = 0;
    cp.spawn = ((file: string, args: string[], options: object) => {
      if (file.endsWith("daedalus-computer-helper.exe")) {
        (globalThis as any).previewNativeStarts++;
        throw new Error("preview_must_not_start_helper");
      }
      return spawn(file, args, options);
    }) as typeof spawn;
    desktopCapturer.getSources = async () => { throw new Error("preview_must_not_capture"); };
  });
  await mainWindow.getByText("Screenshot history", { exact: true }).click();
  await expect.poll(() => mockBackend.getRequests("client.info").length).toBeGreaterThan(1);
  await expect(mainWindow.evaluate(async () => {
    await window.electronAPI.computerObservation!.previewOverlay!({ connectionId: "stale", sessionId: "other-session", requestId: "old-request", action: "running" });
  })).rejects.toThrow("computer_context_changed");
  const command = async (action = "") => {
    const input = mainWindow.getByTestId("composer-input");
    await input.fill(`/test-computer-overlay${action ? ` ${action}` : ""}`);
    await input.press("Escape");
    await input.press("Enter");
  };
  await mainWindow.evaluate(() => window.electronAPI.clientPreferences.update({
    theme: "light", themeColor: "#d45c32", fontFamily: "Arial, sans-serif", uiFontSize: 16, animationsEnabled: false,
  }));
  await command();
  await expect.poll(() => electronApp.windows().filter(page => page.url().includes("surface=")).length).toBe(2);
  const bar = electronApp.windows().find(page => page.url().includes("surface=bar"))!;
  const edge = electronApp.windows().find(page => page.url().includes("surface=edge"))!;
  const geometry = await electronApp.evaluate(({ BrowserWindow, screen }, mainUrl) => {
    const windows = BrowserWindow.getAllWindows();
    const main = windows.find(window => window.webContents.getURL() === mainUrl)!;
    const edge = windows.find(window => window.webContents.getURL().includes("surface=edge"))!;
    return { expected: screen.getDisplayMatching(main.getBounds()).bounds, actual: edge.getContentBounds(), focused: edge.isFocused(), alwaysOnTop: edge.isAlwaysOnTop() };
  }, mainWindow.url());
  expect(geometry.actual).toEqual(geometry.expected);
  expect(geometry.focused).toBe(false);
  expect(geometry.alwaysOnTop).toBe(true);
  const variables = ["--ds-accent", "--ds-text-primary", "--ds-border", "--ds-surface-elevated", "--ds-font-family", "--ds-font-size"];
  const mainVariables = await mainWindow.evaluate(names => {
    const style = getComputedStyle(document.documentElement);
    return names.map(name => style.getPropertyValue(name).trim());
  }, variables);
  for (const page of [bar, edge]) {
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => page.evaluate(names => {
      const style = getComputedStyle(document.documentElement);
      return names.map(name => style.getPropertyValue(name).trim());
    }, variables)).toEqual(mainVariables);
  }
  await expect(bar.getByRole("status")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(edge.locator("[aria-hidden='true']").first()).toHaveCSS("animation-name", "none");
  await bar.screenshot({ path: test.info().outputPath("overlay-theme-light.png"), omitBackground: true });
  // 运行中同步主题，不能给无标题栏 Overlay 设置 titleBarOverlay 或取消控制
  await mainWindow.evaluate(() => window.electronAPI.clientPreferences.update({
    theme: "dark", themeColor: "#52a871", uiFontSize: 14, animationsEnabled: true,
  }));
  for (const page of [bar, edge]) {
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ds-accent").trim())).toBe("#52a871");
  }
  await expect(bar.getByRole("status")).toHaveCSS("background-color", "rgb(31, 31, 31)");
  await expect(bar.getByRole("status")).toHaveCSS("font-size", "14px");
  await mainWindow.evaluate(() => window.electronAPI.clientPreferences.update({ language: "en-US" }));
  await expect.poll(() => bar.getByRole("status").innerText()).toContain("AI is using your computer");
  await mainWindow.evaluate(() => window.electronAPI.clientPreferences.update({ language: "zh-CN" }));
  await expect.poll(() => bar.getByRole("status").innerText()).toMatch(/AI is using your computer|AI正在使用你的电脑/);
  await bar.screenshot({ path: test.info().outputPath("overlay-theme-dark.png"), omitBackground: true });
  await edge.screenshot({ path: test.info().outputPath("overlay-full-display.png"), omitBackground: true });
  await expect(bar.getByRole("status")).toContainText("调试预览 · 不会操作电脑");
  await expect(edge.getByTestId("computer-ai-cursor")).toBeVisible();
  const state = await mainWindow.evaluate(() => window.electronAPI.computerObservation!.getState());
  expect(state).toMatchObject({ enabled: false, controlEnabled: false, pending: null, sharing: null, observation: null });
  expect(state.control).toBeFalsy();
  await command("paused");
  await expect(bar.getByRole("status")).toContainText(/Paused|已暂停/);
  await bar.getByRole("button", { name: /Resume|继续/ }).click();
  await expect(bar.getByRole("status")).toContainText(/AI is using your computer|AI正在使用你的电脑/);
  await command("click");
  await expect(edge.getByTestId("computer-ai-cursor").locator("span")).toHaveCount(1);
  await command("stop");
  await expect.poll(() => electronApp.windows().filter(page => page.url().includes("surface=")).length).toBe(0);
  await command();
  await expect.poll(() => electronApp.windows().filter(page => page.url().includes("surface=bar")).length).toBe(1);
  const nextBar = electronApp.windows().find(page => page.url().includes("surface=bar"))!;
  await nextBar.getByRole("button", { name: /Cancel|取消/ }).click();
  await expect.poll(() => electronApp.windows().filter(page => page.url().includes("surface=")).length).toBe(0);
  expect(await electronApp.evaluate(() => (globalThis as any).previewNativeStarts)).toBe(0);
  for (const method of ["computer.control.update", "computer.tool.result", "computer.access.revoked", "ai.cancel"])
    expect(mockBackend.getRequests(method)).toHaveLength(0);
});
