import { resolve } from "node:path";
import { test, expect } from "./fixtures/studio";
import { installImageAttachmentScenario } from "./fixtures/image-attachments";

test("Windows per-turn consent, same-frame screenshot, revocation and reconnect", async ({
  launchStudio,
  mockBackend,
}) => {
  test.skip(process.platform !== "win32");
  installImageAttachmentScenario(mockBackend);
  mockBackend.setHandler("computer.tool.result", () => ({ accepted: true }));
  mockBackend.setHandler("computer.access.revoked", () => ({ accepted: true }));
  const { mainWindow, electronApp } = await launchStudio();
  await electronApp.evaluate(
    ({ app }, fixture) => {
      if (app.isPackaged) throw new Error("fixture_must_not_run_in_release");
      const childProcess = process.getBuiltinModule("child_process");
      const original = childProcess.spawn;
      childProcess.spawn = ((file: string, args: string[], options: object) => {
        if (!file.endsWith("daedalus-computer-helper.exe"))
          return original(file, args, options);
        return original(process.execPath, [fixture], {
          ...options,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        });
      }) as typeof original;
    },
    resolve(__dirname, "fixtures/computer-helper.cjs"),
  );
  await expect
    .poll(() =>
      mainWindow.evaluate(
        async () =>
          (await window.electronAPI.computerObservation!.getState()).available,
      ),
    )
    .toBe(true);
  expect(
    await mainWindow.evaluate(
      async () =>
        (await window.electronAPI.computerObservation!.getState()).enabled,
    ),
  ).toBe(false);
  async function openSettings() {
    const opened = electronApp.waitForEvent("window");
    await mainWindow.locator('[data-studio-open-settings="true"]').click();
    const page = await opened;
    await page
      .getByRole("menuitem", { name: /Computer use|电脑操作/ })
      .click();
    return page;
  }
  const initialSettings = await openSettings();
  const accessSwitch = initialSettings.getByRole("switch", {
    name: /Allow AI to request window observation|允许 AI 请求观察窗口/,
  });
  await expect(accessSwitch).not.toBeChecked();
  await accessSwitch.click();
  await expect(accessSwitch).toBeChecked();
  await initialSettings.close();
  await mainWindow.getByText("Screenshot history", { exact: true }).click();
  await expect(mainWindow.getByTestId("composer-input")).toBeVisible();
  await expect
    .poll(() => mockBackend.getRequests("client.info").length)
    .toBeGreaterThan(1);
  let connectionId = mockBackend
    .getRequests("client.info")
    .at(-1)!.connectionId;
  let turn = "canonical-turn-1",
    index = 0;
  async function invoke(toolName: string, args: object = {}) {
    const callId = `call-${++index}`;
    mockBackend.sendEvent(
      "computer.tool.request",
      {
        connectionId,
        sessionId: "session-history",
        requestId: turn,
        runId: "run-fixture",
        callId,
        toolCallId: `tool-${index}`,
        toolName,
        args,
      },
      { sessionId: "session-history", requestId: turn, runId: "run-fixture" },
    );
    return callId;
  }
  async function result(callId: string) {
    await expect
      .poll(() =>
        mockBackend
          .getRequests("computer.tool.result")
          .find(
            (request) =>
              (request.params as { callId: string }).callId === callId,
          ),
      )
      .toBeTruthy();
    return mockBackend
      .getRequests("computer.tool.result")
      .find(
        (request) => (request.params as { callId: string }).callId === callId,
      )!.params as {
      ok: boolean;
      result: Record<string, unknown>;
      error: { code: string };
    };
  }
  expect((await result(await invoke("mcp_computer_observe"))).error.code).toBe(
    "computer_consent_required",
  );
  const grantCall = await invoke("mcp_computer_request_access", {
    reason: "Read the dedicated fixture only",
  });
  const dialog = mainWindow.getByRole("dialog");
  await expect(
    dialog.getByText("Read the dedicated fixture only"),
  ).toBeVisible();
  await dialog
    .getByRole("option", { name: "Local perception fixture" })
    .click();
  await dialog
    .getByRole("button", { name: /Allow this turn|允许本轮观察/ })
    .click();
  expect((await result(grantCall)).ok).toBe(true);
  await expect(dialog).not.toBeVisible();
  const observation = (await result(await invoke("mcp_computer_observe")))
    .result;
  expect(observation).not.toHaveProperty("dataUrl");
  expect(observation.texts).toEqual([
    expect.objectContaining({ text: "本地 OCR fixture" }),
  ]);
  const screenshot = (
    await result(
      await invoke("mcp_computer_screenshot", {
        observationId: observation.observationId,
      }),
    )
  ).result;
  const { dataUrl, ...frame } = screenshot;
  expect(frame).toEqual(observation);
  expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  await expect(mainWindow.getByRole("button", { name: /Stop sharing|停止共享/ })).toHaveCount(0);
  await expect(mainWindow.getByRole("alert").filter({ hasText: /Sharing this turn|本轮正在共享/ })).toHaveCount(0);
  // Composer 上方不再提供单独提示条；显式撤销通道仍然生效
  await mainWindow.evaluate(() => window.electronAPI.computerObservation!.revoke());
  expect(
    (
      await result(
        await invoke("mcp_computer_request_access", {
          reason: "Must not prompt twice",
        }),
      )
    ).error.code,
  ).toBe("computer_access_denied");
  turn = "canonical-turn-2";
  const cancelCall = await invoke("mcp_computer_request_access", {
    reason: "Cancel this request",
  });
  await expect(dialog.getByText("Cancel this request")).toBeVisible();
  mockBackend.sendEvent(
    "computer.tool.cancel",
    { callId: cancelCall },
    { sessionId: "session-history" },
  );
  await expect(dialog).not.toBeVisible();
  mockBackend.closeConnections();
  await expect
    .poll(() => mockBackend.getRequests("client.info").at(-1)?.connectionId)
    .not.toBe(connectionId);
  connectionId = mockBackend.getRequests("client.info").at(-1)!.connectionId;
  expect((await result(await invoke("mcp_computer_observe"))).error.code).toBe(
    "computer_access_denied",
  );
  turn = "canonical-turn-3";
  const terminalGrant = await invoke("mcp_computer_request_access", {
    reason: "Terminal run fixture",
  });
  await dialog
    .getByRole("option", { name: "Local perception fixture" })
    .click();
  await dialog
    .getByRole("button", { name: /Allow this turn|允许本轮观察/ })
    .click();
  expect((await result(terminalGrant)).ok).toBe(true);
  mockBackend.sendEvent(
    "agent.run.state",
    {
      stage: "completed",
      requestId: turn,
      rootRequestId: turn,
      runId: "run-fixture",
    },
    { sessionId: "session-history", requestId: turn, runId: "run-fixture" },
  );
  await expect(
    mainWindow.getByRole("button", { name: /Stop sharing|停止共享/ }),
  ).not.toBeVisible();
  await expect.poll(() => mainWindow.evaluate(async () => (await window.electronAPI.computerObservation!.getState()).sharing)).toBeNull();
  expect((await result(await invoke("mcp_computer_observe"))).error.code).toBe(
    "computer_access_denied",
  );
  // 本地诊断不创建 AI 授权、不保存附件，也不发起模型请求
  const settingsWindow = await openSettings();
  await expect(
    settingsWindow.getByRole("switch", {
      name: /Allow AI to request window observation|允许 AI 请求观察窗口/,
    }),
  ).toBeChecked();
  const perception = settingsWindow.getByTestId(
    "computer-observation-settings",
  );
  await perception
    .getByRole("button", {
      name: /Select window for local diagnostics|选择窗口进行本地诊断/,
    })
    .click();
  const diagnosticDialog = settingsWindow.getByRole("dialog");
  await diagnosticDialog
    .getByRole("option", { name: "Local perception fixture" })
    .click();
  await diagnosticDialog
    .getByRole("button", { name: /Observe|观\s*察/ })
    .click();
  await expect(
    diagnosticDialog.getByRole("img", { name: /Static frame|静态/ }),
  ).toBeVisible();
  await expect(diagnosticDialog).toBeVisible();
  await settingsWindow.screenshot({
    path: test.info().outputPath("computer-local-diagnostics.png"),
  });
  await diagnosticDialog.getByRole("button", { name: /Cancel|取\s*消/ }).click();
  await expect(diagnosticDialog).not.toBeVisible();
  await settingsWindow.screenshot({
    path: test.info().outputPath("computer-observation-settings.png"),
  });
  await settingsWindow
    .getByRole("menuitem", { name: /General|常规|通用/ })
    .click();
  await expect(
    settingsWindow.getByRole("switch", {
      name: /Allow AI to request window observation|允许 AI 请求观察窗口/,
    }),
  ).not.toBeVisible();
  await settingsWindow
    .getByRole("menuitem", { name: /Computer use|电脑操作/ })
    .click();
  await expect(
    perception.getByRole("img", { name: /Static frame|静态/ }),
  ).toHaveCount(0);
  await settingsWindow.close();
  await mainWindow.locator('[data-studio-open-side-dock="true"]').click();
  await mainWindow.locator('[data-studio-dock-add="true"]').click();
  await expect(
    mainWindow.getByRole("menuitem", { name: /Computer use|电脑操作/ }),
  ).toHaveCount(0);
  await mainWindow.keyboard.press("Escape");
  expect(
    await mainWindow.evaluate(
      async () =>
        (await window.electronAPI.computerObservation!.getState()).sharing,
    ),
  ).toBeNull();
  expect(mockBackend.getRequests("ai.chat")).toHaveLength(0);
  expect(mockBackend.getRequests("attachment.image.save")).toHaveLength(0);

  const fullRecord = {
    recordId: "computer-full",
    sessionId: "session-history",
    sequence: 1,
    turn: 11,
    kind: "tool_call",
    status: "success",
    requestId: "turn-11",
    startedAt: observation.capturedAt,
    finishedAt: observation.capturedAt,
    durationMs: 10,
    detailLevel: "full",
    hasDetails: true,
    revision: 1,
    truncated: false,
    summary: {
      toolName: "mcp_computer_observe",
      observationId: observation.observationId,
    },
  };
  const oldRecord = {
    ...fullRecord,
    recordId: "computer-old",
    sequence: 2,
    turn: 1,
    requestId: "turn-1",
    detailLevel: "compacted",
    hasDetails: false,
    summary: {
      toolName: "mcp_computer_observe",
      observationId: "old-observation",
    },
  };
  mockBackend.setHandler("session.trace.summary", () => ({
    revision: 1,
    turnCount: 11,
    modelCallCount: 0,
    toolCallCount: 2,
    errorCount: 0,
    durationMs: 20,
    inputTokens: 0,
    outputTokens: 0,
    hasDetails: true,
  }));
  mockBackend.setHandler("session.trace.page", () => ({
    revision: 1,
    records: [oldRecord, fullRecord],
  }));
  mockBackend.setHandler("session.trace.detail", ({ params }) => {
    const record =
      (params as { recordId: string }).recordId === "computer-full"
        ? fullRecord
        : oldRecord;
    return {
      record,
      promptSections: [],
      redactions: [],
      detailLevel: record.detailLevel,
    };
  });
  mockBackend.setHandler("session.computerObservation.get", () => ({
    detailLevel: "full",
    revision: 1,
    observation,
    dataUrl,
  }));
  await mainWindow.locator('[data-studio-dock-add="true"]').click();
  await mainWindow
    .getByRole("menuitem", { name: /Trajectory panel|轨迹面板/ })
    .click();
  const trace = mainWindow.getByTestId("trajectory-panel");
  await trace.getByTestId("trajectory-record-computer-full").click();
  const evidenceHeading = trace
    .locator('[role="button"][aria-expanded]')
    .filter({ hasText: /View desktop evidence|查看桌面观察证据/ });
  await expect(evidenceHeading).toBeVisible();
  if ((await evidenceHeading.getAttribute("aria-expanded")) !== "true")
    await evidenceHeading.click();
  await trace
    .locator("button")
    .filter({ hasText: /View desktop evidence|查看桌面观察证据/ })
    .click();
  await expect(
    trace.getByRole("img", { name: /Static frame|静态/ }),
  ).toBeVisible();
  await trace.getByTestId("trajectory-record-computer-old").click();
  await expect(trace.getByRole("alert")).toContainText(
    /Details compacted|详情已精简/,
  );
  expect(
    mockBackend.getRequests("session.computerObservation.get"),
  ).toHaveLength(1);
  expect(mockBackend.getUnhandledRequests()).toEqual([]);
  // Leave a grant active: fixture teardown must revoke it without sending to destroyed WebContents.
  turn = "canonical-turn-4";
  const closingGrant = await invoke("mcp_computer_request_access", {
    reason: "Window teardown fixture",
  });
  await dialog
    .getByRole("option", { name: "Local perception fixture" })
    .click();
  await dialog
    .getByRole("button", { name: /Allow this turn|允许本轮观察/ })
    .click();
  expect((await result(closingGrant)).ok).toBe(true);
  const sharingSettings = await openSettings();
  expect(
    await sharingSettings.evaluate(() =>
      window.electronAPI.computerObservation!.getState(),
    ),
  ).toMatchObject({
    pending: null,
    sharing: null,
    observation: null,
    diagnosticsBlocked: true,
  });
  await expect(
    sharingSettings.getByRole("button", {
      name: /Select window for local diagnostics|选择窗口进行本地诊断/,
    }),
  ).toBeDisabled();
  await sharingSettings.close();
  expect(await mainWindow.evaluate(async () => (await window.electronAPI.computerObservation!.getState()).sharing)).not.toBeNull();
  await expect(
    mainWindow.getByRole("button", { name: /Stop sharing|停止共享/ }),
  ).toHaveCount(0);
});
