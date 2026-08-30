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
  await command();
  await expect.poll(() => electronApp.windows().filter(page => page.url().includes("surface=")).length).toBe(2);
  const bar = electronApp.windows().find(page => page.url().includes("surface=bar"))!;
  const edge = electronApp.windows().find(page => page.url().includes("surface=edge"))!;
  await expect(bar.getByRole("status")).toContainText("调试预览 · 不会操作电脑");
  await expect(edge.getByTestId("computer-ai-cursor")).toBeVisible();
  const state = await mainWindow.evaluate(() => window.electronAPI.computerObservation!.getState());
  expect(state).toMatchObject({ enabled: false, controlEnabled: false, pending: null, sharing: null, observation: null });
  expect(state.control).toBeFalsy();
  await command("paused");
  await expect(bar.getByRole("status")).toContainText("已暂停");
  await bar.getByRole("button", { name: "继续" }).click();
  await expect(bar.getByRole("status")).toContainText("AI正在使用你的电脑");
  await command("click");
  await expect(edge.getByTestId("computer-ai-cursor").locator("span")).toHaveCount(1);
  await command("stop");
  await expect.poll(() => electronApp.windows().filter(page => page.url().includes("surface=")).length).toBe(0);
  await command();
  await expect.poll(() => electronApp.windows().filter(page => page.url().includes("surface=bar")).length).toBe(1);
  const nextBar = electronApp.windows().find(page => page.url().includes("surface=bar"))!;
  await nextBar.getByRole("button", { name: "取消" }).click();
  await expect.poll(() => electronApp.windows().filter(page => page.url().includes("surface=")).length).toBe(0);
  expect(await electronApp.evaluate(() => (globalThis as any).previewNativeStarts)).toBe(0);
  for (const method of ["computer.control.update", "computer.tool.result", "computer.access.revoked", "ai.cancel"])
    expect(mockBackend.getRequests(method)).toHaveLength(0);
});
