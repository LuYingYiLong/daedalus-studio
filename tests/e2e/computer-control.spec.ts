import { resolve } from "node:path";
import { test, expect } from "./fixtures/studio";
import { installImageAttachmentScenario } from "./fixtures/image-attachments";

test("observation-to-control upgrade, fresh resume, cancellation and full-trust target reuse", async ({
  launchStudio,
  mockBackend,
}) => {
  test.skip(process.platform !== "win32");
  installImageAttachmentScenario(mockBackend);
  for (const method of [
    "computer.tool.result",
    "computer.access.revoked",
    "computer.control.update",
  ])
    mockBackend.setHandler(method, () => ({ accepted: true }));
  const controlStates = new Map<string, { state: string; generation: number; sequence: number }>();
  const staleUpdates: string[] = [];
  mockBackend.setHandler("computer.control.update", ({ params }) => {
    const value = params as { requestId: string; state: string; generation: number; sequence: number };
    const old = controlStates.get(value.requestId);
    // 与实际 Backend 相同：不能用已经发布过 paused 的代次恢复
    if (old && (value.sequence <= old.sequence || value.generation < old.generation ||
      (old.state === "paused" && value.state === "running" && value.generation <= old.generation))) {
      staleUpdates.push(value.requestId);
      throw new Error("computer_update_stale");
    }
    controlStates.set(value.requestId, value);
    return { accepted: true };
  });
  const { mainWindow, electronApp } = await launchStudio();
  await electronApp.evaluate(
    ({ app }, fixture) => {
      if (app.isPackaged) throw new Error("fixture_must_not_run_in_release");
      const cp = process.getBuiltinModule("child_process"),
        original = cp.spawn;
      cp.spawn = ((file: string, args: string[], options: object) =>
        file.endsWith("daedalus-computer-helper.exe")
          ? original(process.execPath, [fixture], {
              ...options,
              env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", COMPUTER_FIXTURE_FAIL_ACTIVATION: "1", COMPUTER_FIXTURE_START_DELAY_MS: "1600", COMPUTER_FIXTURE_OBSERVE_DELAY_MS: "750" },
            })
          : original(file, args, options)) as typeof original;
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
        (await window.electronAPI.computerObservation!.getState())
          .controlEnabled,
    ),
  ).toBe(false);
  await mainWindow.evaluate(async () => {
    await window.electronAPI.computerObservation!.setEnabled(true);
    await window.electronAPI.computerObservation!.setControlEnabled(true);
  });
  await mainWindow.getByText("Screenshot history", { exact: true }).click();
  await expect
    .poll(() => mockBackend.getRequests("client.info").length)
    .toBeGreaterThan(1);
  const connectionId = mockBackend
    .getRequests("client.info")
    .at(-1)!.connectionId;
  let turn = "control-turn",
    runId = "control-run",
    index = 0;
  const identity = () => ({
    connectionId,
    sessionId: "session-history",
    requestId: turn,
    runId,
  });
  function invoke(
    toolName: string,
    args: object = {},
    approvalMode = "manual",
  ) {
    const callId = `call-${++index}`;
    mockBackend.sendEvent(
      "computer.tool.request",
      {
        ...identity(),
        callId,
        toolCallId: `tool-${index}`,
        toolName,
        args,
        authorization: { approvalMode },
        ...(toolName === "mcp_computer_action"
          ? { actionId: `action-${index}` }
          : {}),
      },
      { sessionId: "session-history", requestId: turn, runId },
    );
    return callId;
  }
  async function result(callId: string) {
    await expect
      .poll(() =>
        mockBackend
          .getRequests("computer.tool.result")
          .find((r) => (r.params as { callId: string }).callId === callId),
      )
      .toBeTruthy();
    return mockBackend
      .getRequests("computer.tool.result")
      .find((r) => (r.params as { callId: string }).callId === callId)!
      .params as {
      ok: boolean;
      result: { observationId: string; status?: string; mode?: string; transport?: string };
      error?: { code: string };
    };
  }
  const denied = await result(
    invoke("mcp_computer_action", {
      observationId: "ungranted",
      action: { type: "key", key: "Enter" },
    }),
  );
  expect(denied.ok).toBe(false);
  // 先观察再升级：旧巡检已启动，control.start 故意跨过巡检周期
  const dialog = mainWindow.getByRole("dialog");
  const read = invoke("mcp_computer_request_access", { reason: "Observe before controlling", mode: "observe" });
  await dialog.getByRole("option", { name: "Local perception fixture" }).click();
  await dialog.getByRole("button", { name: /Allow (?:for )?this turn|允许本轮观察/ }).click();
  expect((await result(read)).result.mode).toBe("observe");
  await expect(dialog).not.toBeVisible();
  await expect(mainWindow.getByRole("button", { name: /Stop sharing|停止共享/ })).toHaveCount(0);
  await expect(mainWindow.getByRole("alert").filter({ hasText: /Sharing this turn|本轮正在共享/ })).toHaveCount(0);
  expect((await result(invoke("mcp_computer_observe"))).ok).toBe(true);
  expect(electronApp.windows().filter(w => w.url().includes("surface="))).toHaveLength(0);
  // Modal 关闭不得把焦点重新送回 Studio；拦截测试按钮的 focus，不碰系统前台窗口
  await mainWindow.evaluate(() => {
    const sentinel = document.createElement("button");
    sentinel.id = "control-focus-sentinel";
    sentinel.textContent = "Control focus fixture";
    document.body.append(sentinel);
    sentinel.focus();
    sentinel.focus = () => { sentinel.dataset.restored = "yes"; };
  });
  const call = invoke("mcp_computer_request_access", {
    reason: "Control the mock fixture only",
    mode: "control",
  });
  await dialog
    .getByRole("option", { name: "Local perception fixture" })
    .click();
  await dialog
    .getByRole("button", { name: /Allow control for this turn|允许本轮操作/ })
    .click();
  expect((await result(call)).result.mode).toBe("control");
  await expect(mainWindow.getByRole("alert").filter({ hasText: /Sharing this turn|本轮正在共享/ })).toHaveCount(0);
  await expect(mainWindow.evaluate(async (scope) => {
    await window.electronAPI.computerObservation!.previewOverlay!({ ...scope, action: "running" });
  }, { connectionId, sessionId: "session-history", requestId: "preview-while-controlling" })).rejects.toThrow("computer_busy");
  expect(mockBackend.getRequests("computer.access.revoked")).toHaveLength(0);
  await expect(dialog).not.toBeVisible();
  await expect(mainWindow.locator("#control-focus-sentinel")).not.toHaveAttribute("data-restored", "yes");
  await mainWindow.locator("#control-focus-sentinel").evaluate(node => node.remove());
  const bar = electronApp
    .windows()
    .find((w) => w.url().includes("surface=bar"))!;
  const edge = electronApp
    .windows()
    .find((w) => w.url().includes("surface=edge"))!;
  await expect(bar.getByRole("status")).toContainText(/Waiting for window activation|等待窗口激活/);
  await expect(bar.getByRole("status")).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(bar.getByRole("status")).toContainText(/Switch to the authorized window|请手动切换到授权窗口/);
  await expect(edge.getByTestId("computer-ai-cursor")).toHaveCount(0);
  await expect.poll(() => controlStates.get(turn)?.state).toBe("paused");
  await bar.getByRole("button", { name: /Resume|继续/ }).click();
  await expect(bar.getByRole("button", { name: /Resuming…|恢复中…/ })).toBeDisabled();
  await bar.evaluate(() => { window.computerOverlay.resume(); window.computerOverlay.resume(); });
  await expect(bar.getByRole("status")).toContainText(/AI is using your computer|AI正在使用你的电脑/);
  await expect(edge.getByTestId("computer-ai-cursor")).toBeVisible();
  await expect.poll(() => controlStates.get(turn)?.state).toBe("running");
  expect(await bar.evaluate(() => "electronAPI" in window)).toBe(false);
  expect(await bar.evaluate(() => Object.keys(window.computerOverlay))).toEqual(
    ["ready", "pulse", "cancel", "resume", "subscribe"],
  );
  const observed = (await result(invoke("mcp_computer_observe"))).result;
  for (const action of [
    { type: "click", x: 0, y: 0, count: 1 },
    { type: "click", x: 0, y: 0, count: 2 },
    { type: "scroll", x: 0, y: 0, axis: "vertical", amount: 1 },
  ]) {
    // 无效 Backend 事件在 renderer 解析时即丢弃；这里直接验证 Main IPC 也拒绝坐标输入
    const request = {
      ...identity(),
      callId: `unsupported-${++index}`,
      toolCallId: `tool-${index}`,
      actionId: `action-${index}`,
      toolName: "mcp_computer_action",
      args: { observationId: observed.observationId, action },
      authorization: { approvalMode: "manual" },
    };
    await expect(mainWindow.evaluate(async (input) => {
      return window.electronAPI.computerObservation!.execute(
        input as unknown as Parameters<NonNullable<typeof window.electronAPI.computerObservation>["execute"]>[0],
      );
    }, request)).rejects.toThrow("computer_invalid_request");
  }
  expect(
    (
      await result(
        invoke("mcp_computer_action", {
          observationId: observed.observationId,
          action: { type: "key", key: "Tab" },
        }),
      )
    ).result.status,
  ).toBe("dispatched");
  await bar.screenshot({
    path: test.info().outputPath("computer-control-bar.png"),
    omitBackground: true,
  });
  await edge.screenshot({
    path: test.info().outputPath("computer-control-edge.png"),
    omitBackground: true,
  });
  await mainWindow.screenshot({ path: test.info().outputPath("computer-control-no-composer-alert.png") });
  // Fresh frame for every explicit UIA action; no real native input in E2E.
  for (const action of [{ type: "uia_invoke", nodeId: "node-1" }, { type: "uia_set_value", nodeId: "node-1", value: "" }]) {
    await mainWindow.waitForTimeout(1100);
    const fresh = await result(invoke("mcp_computer_observe"));
    const applied = await result(invoke("mcp_computer_action", { observationId: fresh.result.observationId, action }));
    expect(applied.ok).toBe(true);
    expect(applied.result).toMatchObject({ status: "dispatched", transport: "uia" });
  }
  // Simulate display invalidation, never touch an actual target or inject system input.
  await electronApp.evaluate(({ screen }) =>
    screen.emit("display-metrics-changed", {}, screen.getPrimaryDisplay(), [
      "bounds",
    ]),
  );
  await expect(bar.getByRole("status")).toContainText(/Paused|已暂停/);
  await expect
    .poll(() =>
      mockBackend
        .getRequests("computer.control.update")
        .some((r) => (r.params as { state: string }).state === "paused"),
    )
    .toBe(true);
  await bar.getByRole("button", { name: /Resume|继续/ }).click();
  await expect(bar.getByRole("status")).toContainText(/AI is using your computer|AI正在使用你的电脑/);
  await expect.poll(() => controlStates.get(turn)?.state).toBe("running");
  await expect
    .poll(() =>
      mainWindow.evaluate(
        async () =>
          (await window.electronAPI.computerObservation!.getState()).observation
            ?.observationId,
      ),
    )
    .not.toBe(observed.observationId);
  const stale = await result(
    invoke("mcp_computer_action", {
      observationId: observed.observationId,
      action: { type: "key", key: "Enter" },
    }),
  );
  expect(stale.error?.code).toBe("computer_observation_stale");
  await bar.getByRole("button", { name: /Cancel|取消/ }).click();
  await expect
    .poll(() =>
      mockBackend
        .getRequests("computer.access.revoked")
        .some((r) => (r.params as { requestId: string }).requestId === turn),
    )
    .toBe(true);
  expect(
    (
      await result(
        invoke("mcp_computer_request_access", {
          reason: "Do not reprompt",
          mode: "control",
        }),
      )
    ).ok,
  ).toBe(false);
  turn = "trust-turn";
  runId = "trust-run";
  const first = invoke(
    "mcp_computer_request_access",
    { reason: "Full trust still selects a target", mode: "control" },
    "full-trust",
  );
  await dialog
    .getByRole("option", { name: "Local perception fixture" })
    .click();
  await dialog
    .getByRole("button", { name: /Select this window|选择此窗口/ })
    .click();
  expect((await result(first)).ok).toBe(true);
  mockBackend.sendEvent(
    "agent.run.state",
    { stage: "completed", ...identity(), rootRequestId: turn },
    { sessionId: "session-history", requestId: turn, runId },
  );
  await expect
    .poll(() =>
      mainWindow.evaluate(
        async () =>
          (await window.electronAPI.computerObservation!.getState()).sharing,
      ),
    )
    .toBeNull();
  expect(await mainWindow.evaluate(async () =>
    (await window.electronAPI.computerObservation!.getState()).rememberedTarget,
  )).toBe("Local perception fixture");
  await expect(mainWindow.getByText(/Selected window:|已选择窗口：/)).toHaveCount(0);
  await expect(mainWindow.getByRole("button", { name: /Change window|更换窗口|Stop sharing|停止共享/ })).toHaveCount(0);
  turn = "trust-next";
  runId = "trust-next-run";
  expect(
    (
      await result(
        invoke(
          "mcp_computer_request_access",
          { reason: "Reuse selected target", mode: "control" },
          "full-trust",
        ),
      )
    ).ok,
  ).toBe(true);
  await expect(dialog).not.toBeVisible();
  await mainWindow.evaluate(() =>
    window.electronAPI.computerObservation!.revoke(),
  );
  await expect
    .poll(() =>
      mainWindow.evaluate(
        async () =>
          (await window.electronAPI.computerObservation!.getState()).control,
      ),
    )
    .toBeNull();
  expect(mockBackend.getRequests("ai.chat")).toHaveLength(0);
  expect(staleUpdates).toEqual([]);
  expect(mockBackend.getUnhandledRequests()).toEqual([]);
});

test("cancelled historical turns do not leave an unfinished computer tool running", async ({ launchStudio, mockBackend }) => {
  const { timelines } = installImageAttachmentScenario(mockBackend);
  const time = "2026-08-30T00:00:00.000Z";
  timelines.set("session-history", [{
    id: "cancelled-assistant", type: "assistant", requestId: "cancelled-turn", content: "",
    startedAtUtc: time, completedAtUtc: time, status: "stopped", completionStatus: "stopped",
    bodyParts: [
      { type: "tool", tool_call_id: "finished-observation", events: [
        { type: "agent.tool.call", toolName: "mcp_computer_observe" },
        { type: "agent.tool.result", toolName: "mcp_computer_observe", summary: "Observed fixture" },
      ] },
      { type: "tool", tool_call_id: "cancelled-access", events: [
        { type: "agent.tool.call", toolName: "mcp_computer_request_access" },
      ] },
    ],
  }]);
  const { mainWindow } = await launchStudio();
  await mainWindow.getByText("Screenshot history", { exact: true }).click();
  const stopped = mainWindow.getByRole("button", { name: /Computer Request Access/ });
  await expect(stopped).toContainText(/Stopped|已停止/);
  await expect(stopped).not.toContainText(/Running|运行中/);
  await expect(mainWindow.getByRole("button", { name: /Computer Observe/ })).toContainText(/Done|完成/);
  expect(mockBackend.getRequests("ai.chat")).toHaveLength(0);
});
