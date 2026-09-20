import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ content: "{}", handlers: new Map<string, (...args: unknown[]) => unknown>() }));
vi.mock("electron", () => ({ ipcMain: { handle: (name: string, callback: (...args: unknown[]) => unknown) => state.handlers.set(name, callback) } }));
vi.mock("../../../src/main/services/backend-binary-store", () => ({ getDaedalusDir: () => "/isolated-profile" }));
vi.mock("node:fs/promises", () => ({ readFile: async () => state.content, mkdir: async () => undefined, rename: async () => undefined, writeFile: async (_path: string, value: string) => { state.content = value; } }));

beforeEach(() => { vi.resetModules(); state.handlers.clear(); state.content = "{}"; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

it("discards a previous-generation outbox rather than replaying deleted Flow IDs", async () => {
	state.content = JSON.stringify({ "old-flow": [{ mutationId: "old", kind: "node.create", payload: {} }] });
	const { registerFlowOperationOutboxIpc } = await import("../../../src/main/services/flow-operation-outbox");
	registerFlowOperationOutboxIpc();
	expect(await state.handlers.get("flow-operation-outbox:load")!()).toEqual({});
});

it("keeps current-generation operations across persistence and restores their IDs", async () => {
	const operations = [{ mutationId: "current", kind: "node.move", payload: { nodeId: "node", x: 1, y: 2 } }];
	state.content = JSON.stringify({ generation: "flow-composable-1", operations: { flow: operations } });
	const { registerFlowOperationOutboxIpc } = await import("../../../src/main/services/flow-operation-outbox");
	registerFlowOperationOutboxIpc();
	expect(await state.handlers.get("flow-operation-outbox:load")!()).toEqual({ flow: operations });
	const writing = state.handlers.get("flow-operation-outbox:replace")!(undefined, "flow", []);
	await vi.runAllTimersAsync(); await writing;
	expect(JSON.parse(state.content)).toEqual({ generation: "flow-composable-1", operations: {} });
});
