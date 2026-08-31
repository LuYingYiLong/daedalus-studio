import { resolve } from "node:path";
import type { ElectronApplication, Locator, Page } from "@playwright/test";
import {
  parseComputerObservation,
  type ComputerForwardedRequest,
  type ComputerObservation,
} from "../../src/contracts/computer-observation";
import {
  parseComputerGroundingPreparation,
  type ComputerGroundingPreparation,
  type ComputerGroundingResult,
} from "../../src/contracts/computer-grounding";
import { test, expect, type StudioFixtures } from "./fixtures/studio";
import { installImageAttachmentScenario } from "./fixtures/image-attachments";

type NativeRequest = {
  method: string;
  params: Record<string, unknown>;
  sentAt: number;
};
type AuditedProcess = NodeJS.Process & { groundingE2eRequests: NativeRequest[] };
type ToolReply =
  | { callId: string; ok: true; result: Record<string, unknown> }
  | { callId: string; ok: false; error: { code: string } };
type SavedEvidence = {
  observation: ComputerObservation;
  dataUrl: string;
  groundings: ComputerGroundingResult[];
};

// 只替换测试进程中的 spawn；复用现有假助手，不枚举窗口或发送系统输入
async function installAuditedHelper(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ app }, fixture) => {
    if (app.isPackaged) throw new Error("fixture_must_not_run_in_release");
    const requests: NativeRequest[] = [];
    (process as AuditedProcess).groundingE2eRequests = requests;
    const cp = process.getBuiltinModule("child_process");
    const spawn = cp.spawn;
    cp.spawn = ((file: string, args: string[], options: object) => {
      if (!file.endsWith("daedalus-computer-helper.exe"))
        return spawn(file, args, options);
      const child = spawn(process.execPath, [fixture], {
        ...options,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          COMPUTER_FIXTURE_FAIL_ACTIVATION: "0",
          COMPUTER_FIXTURE_START_DELAY_MS: "0",
          COMPUTER_FIXTURE_OBSERVE_DELAY_MS: "0",
        },
      });
      const stdin = child.stdin;
      if (!stdin) throw new Error("fixture_stdin_required");
      const write = stdin.write;
      let buffer = Buffer.alloc(0);
      stdin.write = ((chunk: Uint8Array, ...writeArgs: unknown[]) => {
        buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
        while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
          const size = buffer.readUInt32LE(0);
          const request = JSON.parse(buffer.subarray(4, size + 4).toString("utf8")) as NativeRequest;
          requests.push({ method: request.method, params: request.params, sentAt: Date.now() });
          buffer = buffer.subarray(size + 4);
        }
        return Reflect.apply(write, stdin, [chunk, ...writeArgs]);
      }) as typeof stdin.write;
      return child;
    }) as typeof spawn;
  }, resolve(__dirname, "fixtures/computer-helper.cjs"));
}

async function nativeRequests(electronApp: ElectronApplication, method: string): Promise<NativeRequest[]> {
  return electronApp.evaluate((_, name) =>
    (process as AuditedProcess).groundingE2eRequests.filter(request => request.method === name), method);
}

async function startGroundingScenario(
  { launchStudio, mockBackend }: Pick<StudioFixtures, "launchStudio" | "mockBackend">,
  advertised = true,
) {
  installImageAttachmentScenario(mockBackend);
  mockBackend.setHandler("client.info", ({ connectionId }) => ({
    connection: { connectionId },
    features: { computerControl: 3, ...(advertised ? { computerGrounding: 1 } : {}) },
  }));
  const replies = new Map<string, ToolReply>();
  const evidence = new Map<string, SavedEvidence>();
  const receipts = new Map<string, ComputerGroundingResult>();
  mockBackend.setHandler("computer.tool.result", ({ params }) => {
    const reply = params as ToolReply;
    replies.set(reply.callId, reply);
    return { accepted: true };
  });
  mockBackend.setHandler("computer.access.revoked", () => ({ accepted: true }));
  mockBackend.setHandler("computer.control.update", () => ({ accepted: true }));
  mockBackend.setHandler("session.computerObservation.get", ({ params }) => {
    const input = params as { sessionId: string; observationId: string };
    const saved = evidence.get(input.observationId);
    if (input.sessionId !== "session-history" || !saved)
      throw new Error("fixture_evidence_not_found");
    return { detailLevel: "full", revision: 1, ...structuredClone(saved) };
  });
  const { mainWindow, electronApp } = await launchStudio();
  await installAuditedHelper(electronApp);
  await expect.poll(() => mainWindow.evaluate(async () =>
    (await window.electronAPI.computerObservation!.getState()).available)).toBe(true);
  await mainWindow.evaluate(async () => {
    await window.electronAPI.computerObservation!.setEnabled(true);
    await window.electronAPI.computerObservation!.setControlEnabled(true);
  });
  await mainWindow.getByText("Screenshot history", { exact: true }).click();
  await expect(mainWindow.getByTestId("composer-input")).toBeVisible();
  await expect.poll(() => mockBackend.getRequests("client.info").length).toBeGreaterThan(1);
  await expect.poll(() => mainWindow.evaluate(async () =>
    (await window.electronAPI.computerObservation!.getState()).controlSupported)).toBe(true);
  const scope = {
    connectionId: mockBackend.getRequests("client.info").at(-1)!.connectionId,
    sessionId: "session-history",
    requestId: "grounding-turn",
    runId: "grounding-run",
  };
  let sequence = 0;
  function request(toolName: ComputerForwardedRequest["toolName"], args: Record<string, unknown> = {}): ComputerForwardedRequest {
    const index = ++sequence;
    return {
      ...scope,
      callId: `grounding-call-${index}`,
      toolCallId: `grounding-tool-${index}`,
      toolName,
      args,
      authorization: { approvalMode: "manual" },
      ...(toolName === "mcp_computer_action" ? { actionId: `grounding-action-${index}` } : {}),
    };
  }
  function invoke(toolName: ComputerForwardedRequest["toolName"], args: Record<string, unknown> = {}): string {
    const input = request(toolName, args);
    mockBackend.sendEvent("computer.tool.request", input, scope);
    return input.callId;
  }
  async function result(callId: string): Promise<ToolReply> {
    await expect.poll(() => replies.has(callId)).toBe(true);
    return replies.get(callId)!;
  }
  async function success(toolName: ComputerForwardedRequest["toolName"], args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const reply = await result(invoke(toolName, args));
    expect(reply.ok, JSON.stringify(reply)).toBe(true);
    if (!reply.ok) throw new Error(reply.error.code);
    return reply.result;
  }
  async function grantControl(): Promise<void> {
    const callId = invoke("mcp_computer_request_access", {
      reason: "Ground the mock fixture button only",
      mode: "control",
    });
    const dialog = mainWindow.getByRole("dialog");
    await dialog.getByRole("option", { name: "Local perception fixture" }).click();
    await dialog.getByRole("button", { name: /Allow control for this turn|允许本轮操作/ }).click();
    expect(await result(callId)).toMatchObject({ ok: true, result: { granted: true, mode: "control" } });
    await expect(dialog).not.toBeVisible();
    await expect.poll(() => mainWindow.evaluate(async () =>
      (await window.electronAPI.computerObservation!.getState()).control?.state)).toBe("running");
    await expect.poll(() => mockBackend.getRequests("computer.control.update").some(value =>
      (value.params as { state: string }).state === "running")).toBe(true);
  }
  async function observe(): Promise<ComputerObservation> {
    // 等待已知的原生采集时间跨过限流窗口，不重试产生新帧的 RPC
    await expect.poll(() => electronApp.evaluate(() => {
      const previous = (process as AuditedProcess).groundingE2eRequests.filter(value => value.method === "observe").at(-1);
      return previous ? Date.now() - previous.sentAt : 1000;
    })).toBeGreaterThanOrEqual(1000);
    return parseComputerObservation(await success("mcp_computer_observe"));
  }
  async function prepare(observationId: string): Promise<ComputerGroundingPreparation> {
    return parseComputerGroundingPreparation(await success("grounding.prepare", { observationId }));
  }
  async function validateAndSave(prepared: ComputerGroundingPreparation, receipt: ComputerGroundingResult): Promise<ToolReply> {
    const reply = await result(invoke("grounding.validate", {
      observationId: prepared.observation.observationId,
      generation: prepared.generation,
    }));
    if (reply.ok) {
      expect(reply.result).toEqual({ observationId: receipt.observationId, generation: receipt.generation, valid: true });
      // 固定结果代替模型与 Backend 匹配器；仅模拟校验成功后保存回执的协调顺序
      receipts.set(receipt.groundingId, structuredClone(receipt));
      const { dataUrl, ...observation } = prepared.observation;
      const saved: SavedEvidence = evidence.get(observation.observationId) ?? { observation, dataUrl, groundings: [] };
      saved.groundings.push(structuredClone(receipt));
      evidence.set(observation.observationId, saved);
    }
    return reply;
  }
  return { mainWindow, electronApp, scope, receipts, evidence, request, invoke, result, success, grantControl, observe, prepare, validateAndSave };
}

// 状态与候选框是预设证据，不在 Studio E2E 中重做 Backend 的视觉/UIA 匹配
function fixtureReceipt(prepared: ComputerGroundingPreparation, status: "matched" | "ambiguous" | "visual_only"): ComputerGroundingResult {
  const candidate = status === "matched"
    ? { description: "Matched fixture button", box: { x: 0, y: 0, width: 0.5, height: 0.5 }, status, nodeId: "node-1", supportedActions: ["uia_invoke" as const] }
    : {
      description: status === "ambiguous" ? "Ambiguous fixture button" : "Visual-only fixture decoration",
      box: status === "ambiguous"
        ? { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
        : { x: 0.5, y: 0.5, width: 0.25, height: 0.25 },
      status,
    };
  return {
    groundingId: `receipt-${prepared.observation.observationId}-${status}`,
    observationId: prepared.observation.observationId,
    generation: prepared.generation,
    target: `Fixture query: ${status}`,
    uiaAction: "uia_invoke",
    coordinateSpace: "image_pixels",
    status,
    candidates: [candidate],
    provider: "fixture-provider",
    model: "fixture-vision-model",
    durationMs: 12,
    untrustedEvidence: true,
  };
}

async function openSavedEvidence(mainWindow: Page, mockBackend: StudioFixtures["mockBackend"], observation: ComputerObservation): Promise<Locator> {
  const record = {
    recordId: "grounding-evidence",
    sessionId: "session-history",
    sequence: 1,
    turn: 1,
    kind: "tool_call",
    status: "success",
    requestId: "grounding-turn",
    startedAt: observation.capturedAt,
    finishedAt: observation.capturedAt,
    durationMs: 12,
    detailLevel: "full",
    hasDetails: true,
    revision: 1,
    truncated: false,
    summary: { toolName: "mcp_computer_locate", observationId: observation.observationId },
  };
  mockBackend.setHandler("session.trace.summary", () => ({
    revision: 1, turnCount: 1, modelCallCount: 0, toolCallCount: 1, errorCount: 0,
    durationMs: 12, inputTokens: 0, outputTokens: 0, hasDetails: true,
  }));
  mockBackend.setHandler("session.trace.page", () => ({ revision: 1, records: [record] }));
  mockBackend.setHandler("session.trace.detail", () => ({ record, promptSections: [], redactions: [], detailLevel: "full" }));
  await mainWindow.locator('[data-studio-open-side-dock="true"]').click();
  await expect(mainWindow.locator('[data-side-dock-open="true"]')).toBeVisible();
  await mainWindow.locator('[data-studio-dock-add="true"]').click();
  await mainWindow.getByRole("menuitem", { name: /Trajectory panel|轨迹面板/ }).click();
  const trace = mainWindow.getByTestId("trajectory-panel");
  await trace.getByTestId("trajectory-record-grounding-evidence").click();
  const heading = trace.locator('[role="button"][aria-expanded]').filter({ hasText: /View desktop evidence|查看桌面观察证据/ });
  await expect(heading).toBeVisible();
  if (await heading.getAttribute("aria-expanded") !== "true") await heading.click();
  await trace.locator("button").filter({ hasText: /View desktop evidence|查看桌面观察证据/ }).click();
  await expect(trace.getByRole("img", { name: /Static frame|静态/ })).toBeVisible();
  await trace.getByRole("tab", { name: /Visual grounding|视觉定位/ }).click();
  return trace;
}

test("negotiated grounding reuses one frame, dispatches a receipt-backed UIA action, and renders saved evidence", async ({ launchStudio, mockBackend }) => {
  test.skip(process.platform !== "win32");
  const scenario = await startGroundingScenario({ launchStudio, mockBackend });
  const { mainWindow, electronApp, success, invoke, result, prepare, observe } = scenario;
  await expect.poll(() => {
    const update = mockBackend.getRequests("client.capabilities.update").at(-1);
    return (update?.params as { capabilities?: Record<string, boolean> } | undefined)?.capabilities;
  }).toMatchObject({ computerObservation: true, computerControl: true, computerGrounding: true });
  for (const hello of mockBackend.getRequests("client.hello"))
    expect((hello.params as { capabilities: object }).capabilities).not.toHaveProperty("computerGrounding");

  expect(await result(invoke("grounding.prepare", { observationId: "ungranted" })))
    .toMatchObject({ ok: false, error: { code: "computer_consent_required" } });
  expect(await result(invoke("grounding.validate", { observationId: "ungranted", generation: 0 })))
    .toMatchObject({ ok: false, error: { code: "computer_consent_required" } });
  await expect(mainWindow.getByRole("dialog")).not.toBeVisible();
  expect(await nativeRequests(electronApp, "observe")).toHaveLength(0);
  await scenario.grantControl();
  const observation = await observe();
  expect(observation).not.toHaveProperty("dataUrl");
  const prepared = await prepare(observation.observationId);
  const { dataUrl, ...sameFrame } = prepared.observation;
  expect(sameFrame).toEqual(observation);
  expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  expect(prepared.observation).toEqual(await mainWindow.evaluate(async () =>
    (await window.electronAPI.computerObservation!.getState()).observation));
  expect(await prepare(observation.observationId)).toEqual(prepared);
  for (const status of ["matched", "ambiguous", "visual_only"] as const)
    expect(await scenario.validateAndSave(prepared, fixtureReceipt(prepared, status))).toMatchObject({ ok: true });
  expect(scenario.receipts.size).toBe(3);
  expect(await nativeRequests(electronApp, "observe")).toHaveLength(1);
  expect(await nativeRequests(electronApp, "action")).toHaveLength(0);
  expect(await nativeRequests(electronApp, "grounding.prepare")).toHaveLength(0);
  expect(await nativeRequests(electronApp, "grounding.validate")).toHaveLength(0);

  const receipt = scenario.receipts.get(fixtureReceipt(prepared, "matched").groundingId)!;
  const candidate = receipt.candidates[0];
  expect(candidate.status).toBe("matched");
  if (candidate.status !== "matched") throw new Error("fixture_match_required");
  for (const action of [
    { type: "click", x: 0, y: 0, count: 1 },
    { type: "move", x: 0, y: 0 },
    { type: "scroll", x: 0, y: 0, axis: "vertical", amount: 1 },
    { type: "uia_invoke", nodeId: candidate.nodeId, x: 0, y: 0 },
  ]) {
    const args = { observationId: receipt.observationId, groundingId: receipt.groundingId, action };
    expect(await result(invoke("mcp_computer_action", args)))
      .toMatchObject({ ok: false, error: { code: "computer_invalid_request" } });
    await expect(mainWindow.evaluate(input => window.electronAPI.computerObservation!.execute(input),
      scenario.request("mcp_computer_action", args))).rejects.toThrow("computer_invalid_request");
  }
  expect(await nativeRequests(electronApp, "action")).toHaveLength(0);
  const action = { type: receipt.uiaAction, nodeId: candidate.nodeId };
  expect(await success("mcp_computer_action", {
    observationId: receipt.observationId, groundingId: receipt.groundingId, action,
  })).toMatchObject({ observationId: receipt.observationId, status: "dispatched", transport: "uia" });
  const dispatched = await nativeRequests(electronApp, "action");
  expect(dispatched).toHaveLength(1);
  expect(dispatched[0].params).toEqual({
    observationId: receipt.observationId, action, actionId: expect.any(String), generation: receipt.generation,
  });
  expect(await mainWindow.evaluate(async () =>
    (await window.electronAPI.computerObservation!.getState()).observation)).toBeNull();
  expect(await result(invoke("grounding.validate", {
    observationId: receipt.observationId, generation: receipt.generation,
  }))).toMatchObject({ ok: false, error: { code: "computer_observation_stale" } });
  expect(await nativeRequests(electronApp, "observe")).toHaveLength(1);
  const next = await observe();
  expect(next.observationId).not.toBe(receipt.observationId);
  expect(await nativeRequests(electronApp, "observe")).toHaveLength(2);

  // 先结束控制，再读取旧帧证据；历史候选项只能高亮，不能重新授权或触发输入
  await mainWindow.evaluate(() => window.electronAPI.computerObservation!.revoke());
  await expect.poll(() => mainWindow.evaluate(async () =>
    (await window.electronAPI.computerObservation!.getState()).control)).toBeNull();
  const trace = await openSavedEvidence(mainWindow, mockBackend, observation);
  const frame = trace.getByRole("img", { name: /Static frame|静态/ });
  await expect(frame).toHaveAttribute("src", dataUrl);
  const tab = trace.getByRole("tabpanel", { name: /Visual grounding|视觉定位/ });
  await expect(tab).toContainText(/Model-generated evidence may be inaccurate|模型生成的证据可能不准确/);
  await expect(tab.locator("section")).toHaveCount(3);
  const expectedStatuses = [/UIA match|已匹配 UIA 控件/, /Ambiguous|匹配不明确/, /Visual only|仅视觉结果/];
  const saved = scenario.evidence.get(observation.observationId)!.groundings;
  const before = mockBackend.getRequests("computer.tool.result").length;
  for (const [index, grounding] of saved.entries()) {
    const section = tab.locator("section").filter({ hasText: grounding.target });
    await expect(section).toContainText(grounding.provider);
    await expect(section).toContainText(grounding.model);
    await expect(section).toContainText("12 ms");
    await expect(section.locator("dd").last()).toContainText(expectedStatuses[index]);
    const button = section.getByRole("button", { name: new RegExp(grounding.candidates[0].description) });
    await expect(button).toHaveAttribute("title", /Highlight this candidate in the screenshot|在截图中高亮此候选项/);
    await expect(button).toContainText(expectedStatuses[index]);
    await button.click();
    const highlight = frame.locator("..").locator(":scope > div");
    await expect(highlight).toBeVisible();
    const box = grounding.candidates[0].box;
    await expect.poll(() => highlight.evaluate(element => ({
      left: (element as HTMLElement).style.left,
      top: (element as HTMLElement).style.top,
      width: (element as HTMLElement).style.width,
      height: (element as HTMLElement).style.height,
    }))).toEqual({
      left: `${box.x / observation.width * 100}%`,
      top: `${box.y / observation.height * 100}%`,
      width: `${box.width / observation.width * 100}%`,
      height: `${box.height / observation.height * 100}%`,
    });
  }
  await expect(mainWindow.getByRole("dialog")).not.toBeVisible();
  expect(await mainWindow.evaluate(async () =>
    (await window.electronAPI.computerObservation!.getState()).sharing)).toBeNull();
  expect(await nativeRequests(electronApp, "action")).toEqual(dispatched);
  expect(await nativeRequests(electronApp, "observe")).toHaveLength(2);
  expect(mockBackend.getRequests("computer.tool.result")).toHaveLength(before);

  // 不刷新面板：匹配当前帧的精简通知必须立即撤下已展示的图片与候选项
  mockBackend.sendEvent("session.trace.updated", {
    revision: 2,
    recordId: "grounding-evidence",
    changeType: "compacted",
    record: {
      recordId: "grounding-evidence",
      sessionId: scenario.scope.sessionId,
      sequence: 1,
      turn: 1,
      kind: "tool_call",
      status: "success",
      requestId: scenario.scope.requestId,
      startedAt: observation.capturedAt,
      detailLevel: "compacted",
      hasDetails: false,
      revision: 2,
      truncated: false,
      summary: { toolName: "mcp_computer_locate", observationId: observation.observationId },
    },
  }, scenario.scope);
  await expect(trace.getByTestId("trajectory-inspector").getByRole("alert"))
    .toContainText(/Details compacted|详情已精简/);
  await expect(frame).toHaveCount(0);
  await expect(trace.getByRole("tab", { name: /Visual grounding|视觉定位/ })).toHaveCount(0);
  for (const grounding of saved)
    for (const candidate of grounding.candidates)
      await expect(trace.getByText(candidate.description, { exact: true })).toHaveCount(0);
  expect(mockBackend.getRequests("session.computerObservation.get").map(value => value.params))
    .toEqual([{ sessionId: "session-history", observationId: observation.observationId }]);
  expect(mockBackend.getRequests("ai.chat")).toHaveLength(0);
  expect(mockBackend.getRequests("attachment.image.save")).toHaveLength(0);
  expect(mockBackend.getUnhandledRequests()).toEqual([]);
});

test("grounding validation rejects a newer frame and a paused generation without saving late receipts", async ({ launchStudio, mockBackend }) => {
  test.skip(process.platform !== "win32");
  const scenario = await startGroundingScenario({ launchStudio, mockBackend });
  const { mainWindow, electronApp, observe, prepare, invoke, result } = scenario;
  await scenario.grantControl();
  const first = await prepare((await observe()).observationId);
  const second = await observe();
  expect(second.observationId).not.toBe(first.observation.observationId);
  const captures = await nativeRequests(electronApp, "observe");
  expect(await scenario.validateAndSave(first, fixtureReceipt(first, "matched")))
    .toMatchObject({ ok: false, error: { code: "computer_observation_stale" } });
  expect(await result(invoke("grounding.prepare", { observationId: first.observation.observationId })))
    .toMatchObject({ ok: false, error: { code: "computer_observation_stale" } });
  expect(await nativeRequests(electronApp, "observe")).toEqual(captures);
  const current = await prepare(second.observationId);
  expect(await result(invoke("grounding.validate", { observationId: second.observationId, generation: current.generation + 1 })))
    .toMatchObject({ ok: false, error: { code: "computer_observation_stale" } });

  // 模拟显示器失效事件，不移动实际窗口、不注入用户输入
  await electronApp.evaluate(({ screen }) =>
    screen.emit("display-metrics-changed", {}, screen.getPrimaryDisplay(), ["bounds"]));
  await expect.poll(() => mainWindow.evaluate(async () =>
    (await window.electronAPI.computerObservation!.getState()).control?.state)).toBe("paused");
  await expect.poll(() => mockBackend.getRequests("computer.control.update").some(value =>
    (value.params as { state: string }).state === "paused")).toBe(true);
  expect(await scenario.validateAndSave(current, fixtureReceipt(current, "matched")))
    .toMatchObject({ ok: false, error: { code: "computer_paused" } });
  expect(await result(invoke("grounding.prepare", { observationId: second.observationId })))
    .toMatchObject({ ok: false, error: { code: "computer_paused" } });
  expect(scenario.receipts.size).toBe(0);
  expect(scenario.evidence.size).toBe(0);
  expect(await nativeRequests(electronApp, "observe")).toEqual(captures);
  expect(await nativeRequests(electronApp, "action")).toHaveLength(0);
  const bar = electronApp.windows().find(page => page.url().includes("surface=bar"))!;
  await expect(bar.getByRole("status")).toContainText("已暂停");
  await bar.getByRole("button", { name: "继续" }).click();
  await expect.poll(() => mainWindow.evaluate(async () =>
    (await window.electronAPI.computerObservation!.getState()).control?.state)).toBe("running");
  const resumed = await mainWindow.evaluate(async () => window.electronAPI.computerObservation!.getState());
  expect(resumed.control!.generation).toBeGreaterThan(current.generation);
  expect(resumed.observation!.observationId).not.toBe(second.observationId);
  expect(await scenario.validateAndSave(current, fixtureReceipt(current, "matched")))
    .toMatchObject({ ok: false, error: { code: "computer_observation_stale" } });
  expect(await nativeRequests(electronApp, "observe")).toHaveLength(captures.length + 1);
  const fresh = await prepare(resumed.observation!.observationId);
  expect(fresh.generation).toBe(resumed.control!.generation);
  expect(await scenario.validateAndSave(fresh, fixtureReceipt(fresh, "matched"))).toMatchObject({ ok: true });
  expect(scenario.receipts.size).toBe(1);
  expect(await nativeRequests(electronApp, "observe")).toHaveLength(captures.length + 1);
  expect(await nativeRequests(electronApp, "action")).toHaveLength(0);
  await mainWindow.evaluate(() => window.electronAPI.computerObservation!.revoke());
  expect(mockBackend.getRequests("ai.chat")).toHaveLength(0);
  expect(mockBackend.getUnhandledRequests()).toEqual([]);
});

test("a Backend without grounding v1 never receives the new capability or runs internal grounding operations", async ({ launchStudio, mockBackend }) => {
  test.skip(process.platform !== "win32");
  const { mainWindow, electronApp, invoke, result } = await startGroundingScenario({ launchStudio, mockBackend }, false);
  await expect.poll(() => {
    const update = mockBackend.getRequests("client.capabilities.update").at(-1);
    return (update?.params as { capabilities?: Record<string, boolean> } | undefined)?.capabilities;
  }).toMatchObject({ computerObservation: true, computerControl: true });
  for (const value of [...mockBackend.getRequests("client.hello"), ...mockBackend.getRequests("client.capabilities.update")])
    expect((value.params as { capabilities: object }).capabilities).not.toHaveProperty("computerGrounding");
  for (const toolName of ["grounding.prepare", "grounding.validate"] as const) {
    expect(await result(invoke(toolName, { observationId: "unnegotiated-frame", ...(toolName === "grounding.validate" ? { generation: 0 } : {}) })))
      .toMatchObject({ ok: false, error: { code: "computer_tool_not_supported" } });
  }
  await expect(mainWindow.getByRole("dialog")).not.toBeVisible();
  expect(await nativeRequests(electronApp, "observe")).toHaveLength(0);
  expect(await nativeRequests(electronApp, "action")).toHaveLength(0);
  expect(mockBackend.getRequests("ai.chat")).toHaveLength(0);
  expect(mockBackend.getUnhandledRequests()).toEqual([]);
});
