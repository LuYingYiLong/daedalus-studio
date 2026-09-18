import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowOperationOutbox } from "../../../src/renderer/src/domain/flow/flow-operation-outbox";
import type { FlowOperation, FlowPatchAck } from "../../../src/renderer/src/platform/rpc/types";

type FakeWindow = Window & typeof globalThis;

let replaceOutbox: ReturnType<typeof vi.fn>;

function move(index: number): FlowOperation {
	return {
		mutationId: `mutation-${index}`,
		kind: "node.move",
		baseLayoutRevision: 1,
		payload: { nodeId: "node-a", x: index, y: index * 2 },
	};
}

describe("FlowOperationOutbox", (): void => {
	beforeEach((): void => {
		const storage = new Map<string, string>();
		replaceOutbox = vi.fn(async (): Promise<void> => undefined);
		const fakeWindow = {
			localStorage: {
				getItem: (key: string): string | null => storage.get(key) ?? null,
				setItem: (key: string, value: string): void => { storage.set(key, value); },
			},
			setTimeout: globalThis.setTimeout.bind(globalThis),
			clearTimeout: globalThis.clearTimeout.bind(globalThis),
			electronAPI: {
				flowOperationOutbox: {
					load: vi.fn(async (): Promise<Record<string, FlowOperation[]>> => ({})),
					replace: replaceOutbox,
				},
			},
		} as unknown as FakeWindow;
		vi.stubGlobal("window", fakeWindow);
	});

	afterEach((): void => {
		vi.unstubAllGlobals();
	});

	it("coalesces repeated layout changes and commits only the final value", async (): Promise<void> => {
		const box = new FlowOperationOutbox();
		const batches: FlowOperation[][] = [];
		box.connect(async (flowId, _clientId, operations): Promise<FlowPatchAck> => {
			batches.push(operations);
			return { flowId, graphRevision: 1, layoutRevision: 2, acceptedMutationIds: operations.map((operation): string => operation.mutationId), operations };
		}, (error): never => { throw error; });
		for (let index = 0; index < 100; index += 1) box.enqueue("flow-a", move(index));
		await box.flush("flow-a");
		box.disconnect();
		expect(batches).toHaveLength(1);
		expect(batches[0]).toHaveLength(1);
		expect(batches[0]?.[0]).toMatchObject({ kind: "node.move", payload: { nodeId: "node-a", x: 99, y: 198 } });
		expect(box.hasPending("flow-a")).toBe(false);
	});

	it("merges adjacent config edits into one semantic operation", async (): Promise<void> => {
		const box = new FlowOperationOutbox();
		const batches: FlowOperation[][] = [];
		box.connect(async (flowId, _clientId, operations): Promise<FlowPatchAck> => {
			batches.push(operations);
			return { flowId, graphRevision: 2, layoutRevision: 1, acceptedMutationIds: operations.map((operation): string => operation.mutationId), operations };
		}, (error): never => { throw error; });
		box.enqueue("flow-a", { mutationId: "mutation-title", kind: "node.update", baseGraphRevision: 1, payload: { nodeId: "node-a", title: "Draft" } });
		box.enqueue("flow-a", { mutationId: "mutation-config-a", kind: "node.update", baseGraphRevision: 1, payload: { nodeId: "node-a", config: { prompt: "Hello" } } });
		box.enqueue("flow-a", { mutationId: "mutation-config-b", kind: "node.update", baseGraphRevision: 1, payload: { nodeId: "node-a", config: { temperature: 0.5 } } });
		await box.flush("flow-a");
		box.disconnect();
		expect(batches).toHaveLength(1);
		expect(batches[0]).toEqual([{
			mutationId: "mutation-config-b",
			kind: "node.update",
			baseGraphRevision: 1,
			payload: { nodeId: "node-a", title: "Draft", config: { prompt: "Hello", temperature: 0.5 } },
		}]);
	});

	it("persists the pending batch before sending it to the backend", async (): Promise<void> => {
		let releasePersistence: (() => void) | undefined;
		replaceOutbox.mockImplementation(async (): Promise<void> => await new Promise<void>((resolve): void => {
			releasePersistence = resolve;
		}));
		const committer = vi.fn(async (flowId: string, _clientId: string, operations: FlowOperation[]): Promise<FlowPatchAck> => ({
			flowId,
			graphRevision: 1,
			layoutRevision: 2,
			acceptedMutationIds: operations.map((operation): string => operation.mutationId),
			operations,
		}));
		const box = new FlowOperationOutbox();
		box.connect(committer, (error): never => { throw error; });
		box.enqueue("flow-a", move(1));
		const flushing = box.flush("flow-a");
		await Promise.resolve();
		await Promise.resolve();
		expect(committer).not.toHaveBeenCalled();
		releasePersistence?.();
		await flushing;
		box.disconnect();
		expect(committer).toHaveBeenCalledTimes(1);
	});
});
