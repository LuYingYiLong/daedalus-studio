import { resolve } from "node:path";
import { test, expect } from "./fixtures/studio";
import { installImageAttachmentScenario } from "./fixtures/image-attachments";

test("single-window control overlay, fresh resume, cancellation and full-trust target reuse", async ({
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
              env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
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
      result: { observationId: string; status?: string; mode?: string };
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
  const call = invoke("mcp_computer_request_access", {
    reason: "Control the mock fixture only",
    mode: "control",
  });
  const dialog = mainWindow.getByRole("dialog");
  await dialog
    .getByRole("option", { name: "Local perception fixture" })
    .click();
  await dialog
    .getByRole("button", { name: /Allow control for this turn|允许本轮操作/ })
    .click();
  expect((await result(call)).result.mode).toBe("control");
  await expect(dialog).not.toBeVisible();
  const bar = electronApp
    .windows()
    .find((w) => w.url().includes("surface=bar"))!;
  const edge = electronApp
    .windows()
    .find((w) => w.url().includes("surface=edge"))!;
  await expect(bar.getByRole("status")).toContainText("AI正在使用你的电脑");
  expect(await bar.evaluate(() => "electronAPI" in window)).toBe(false);
  expect(await bar.evaluate(() => Object.keys(window.computerOverlay))).toEqual(
    ["ready", "pulse", "cancel", "resume", "subscribe"],
  );
  const observed = (await result(invoke("mcp_computer_observe"))).result;
  expect(
    (
      await result(
        invoke("mcp_computer_action", {
          observationId: observed.observationId,
          action: { type: "click", x: 0, y: 0, count: 1 },
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
  // Simulate display invalidation, never touch an actual target or inject system input.
  await electronApp.evaluate(({ screen }) =>
    screen.emit("display-metrics-changed", {}, screen.getPrimaryDisplay(), [
      "bounds",
    ]),
  );
  await expect(bar.getByRole("status")).toContainText("已暂停");
  await expect
    .poll(() =>
      mockBackend
        .getRequests("computer.control.update")
        .some((r) => (r.params as { state: string }).state === "paused"),
    )
    .toBe(true);
  await bar.getByRole("button", { name: "继续" }).click();
  await expect(bar.getByRole("status")).toContainText("AI正在使用你的电脑");
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
  await bar.getByRole("button", { name: "取消" }).click();
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
  expect(mockBackend.getUnhandledRequests()).toEqual([]);
});
