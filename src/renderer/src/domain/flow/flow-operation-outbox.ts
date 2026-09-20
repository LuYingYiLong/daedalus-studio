import type { FlowOperation, FlowPatchAck } from "@/platform/rpc/types";

const CLIENT_KEY = "daedalus.flow.client-id.v1";
const COMMIT_DELAY_MS = 120;

type Committer = (flowId: string, clientId: string, operations: FlowOperation[]) => Promise<FlowPatchAck>;
type ErrorHandler = (error: unknown, flowId: string | null) => void;

function isFlowOperation(value: unknown): value is FlowOperation {
	return typeof value === "object" && value !== null && typeof (value as FlowOperation).mutationId === "string" && typeof (value as FlowOperation).kind === "string";
}

function operationMergeKey(operation: FlowOperation): string | null {
	if (operation.kind === "node.move" || operation.kind === "node.resize" || operation.kind === "node.collapse") return `${operation.kind}:${operation.payload.nodeId}`;
	if (operation.kind === "viewport.update") return operation.kind;
	return null;
}

function mergeAdjacentNodeUpdate(current: FlowOperation[], operation: FlowOperation): boolean {
	if (operation.kind !== "node.update") return false;
	const previous = current.at(-1);
	if (previous?.kind !== "node.update" || previous.payload.nodeId !== operation.payload.nodeId) return false;
	current[current.length - 1] = {
		...operation,
		payload: {
			...previous.payload,
			...operation.payload,
			...(previous.payload.config === undefined && operation.payload.config === undefined ? {} : {
				config: { ...(previous.payload.config ?? {}), ...(operation.payload.config ?? {}) },
			}),
		},
	};
	return true;
}

export class FlowOperationOutbox {
	readonly clientId: string;
	private readonly operations = new Map<string, FlowOperation[]>();
	private readonly timers = new Map<string, number>();
	private readonly flushing = new Map<string, Promise<FlowPatchAck | null>>();
	private committer: Committer | null = null;
	private onError: ErrorHandler | null = null;
	private connectionId: symbol | null = null;
	private hydrated: Promise<void> | null = null;
	private readonly persistence = new Map<string, Promise<void>>();

	constructor() {
		const storedId = typeof window === "undefined" ? null : window.localStorage.getItem(CLIENT_KEY);
		this.clientId = storedId ?? `studio-${crypto.randomUUID()}`;
		if (typeof window !== "undefined") window.localStorage.setItem(CLIENT_KEY, this.clientId);
	}

	connect(committer: Committer, onError: ErrorHandler): () => void {
		const connectionId = Symbol("flow-operation-outbox-connection");
		this.connectionId = connectionId;
		this.committer = committer;
		this.onError = onError;
		void this.hydrate().then((): void => {
			for (const flowId of this.operations.keys()) this.schedule(flowId, 0);
		}).catch((error: unknown): void => onError(error, null));
		return (): void => this.disconnect(connectionId);
	}

	disconnect(connectionId?: symbol): void {
		if (connectionId !== undefined && this.connectionId !== connectionId) return;
		this.connectionId = null;
		this.committer = null;
		this.onError = null;
		for (const timer of this.timers.values()) window.clearTimeout(timer);
		this.timers.clear();
	}

	enqueue(flowId: string, operation: FlowOperation): void {
		const current = [...(this.operations.get(flowId) ?? [])];
		const mergeKey = operationMergeKey(operation);
		const index = mergeKey === null ? -1 : current.findIndex((candidate): boolean => operationMergeKey(candidate) === mergeKey);
		if (mergeAdjacentNodeUpdate(current, operation)) {
			// Consecutive editor patches form one semantic operation and one undo step.
		} else if (index >= 0) current[index] = operation;
		else current.push(operation);
		this.operations.set(flowId, current);
		this.persist(flowId);
		this.schedule(flowId, COMMIT_DELAY_MS);
	}

	async flush(flowId: string): Promise<FlowPatchAck | null> {
		const active = this.flushing.get(flowId);
		if (active !== undefined) return active;
		const promise = this.flushNow(flowId).finally((): void => {
			this.flushing.delete(flowId);
			if ((this.operations.get(flowId)?.length ?? 0) > 0) this.schedule(flowId, 500);
		});
		this.flushing.set(flowId, promise);
		return promise;
	}

	async flushAll(): Promise<void> {
		await this.hydrate();
		await Promise.all([...this.operations.keys()].map(async (flowId): Promise<void> => {
			await this.flushFully(flowId);
		}));
	}

	async flushFully(flowId: string): Promise<void> {
		await this.hydrate();
		while ((this.operations.get(flowId)?.length ?? 0) > 0) {
			const acknowledged = await this.flush(flowId);
			if (acknowledged === null) throw new Error("flow_operation_outbox_disconnected");
		}
	}

	hasPending(flowId: string): boolean {
		return (this.operations.get(flowId)?.length ?? 0) > 0 || this.flushing.has(flowId);
	}

	readPending(flowId: string): FlowOperation[] {
		return [...(this.operations.get(flowId) ?? [])];
	}

	discard(flowId: string): void {
		const timer = this.timers.get(flowId);
		if (timer !== undefined) window.clearTimeout(timer);
		this.timers.delete(flowId);
		this.operations.delete(flowId);
		this.persist(flowId);
	}

	rebase(flowId: string, graphRevision: number, layoutRevision: number): void {
		const current = this.operations.get(flowId);
		if (current === undefined) return;
		this.operations.set(flowId, current.map((operation): FlowOperation => {
			if ("baseGraphRevision" in operation) return { ...operation, baseGraphRevision: graphRevision } as FlowOperation;
			if ("baseLayoutRevision" in operation) return { ...operation, baseLayoutRevision: layoutRevision } as FlowOperation;
			return operation;
		}));
		this.persist(flowId);
	}

	private async flushNow(flowId: string): Promise<FlowPatchAck | null> {
		await this.hydrate();
		await this.persistence.get(flowId);
		const committer = this.committer;
		const batch = [...(this.operations.get(flowId) ?? [])];
		if (committer === null || batch.length === 0) return null;
		const startedAt = performance.now();
		try {
			const ack = await committer(flowId, this.clientId, batch);
			const accepted = new Set(ack.acceptedMutationIds);
			const remaining = (this.operations.get(flowId) ?? []).filter((operation): boolean => !accepted.has(operation.mutationId)).map((operation): FlowOperation => {
				if ("baseGraphRevision" in operation) return { ...operation, baseGraphRevision: ack.graphRevision } as FlowOperation;
				if ("baseLayoutRevision" in operation) return { ...operation, baseLayoutRevision: ack.layoutRevision } as FlowOperation;
				return operation;
			});
			if (remaining.length === 0) this.operations.delete(flowId);
			else this.operations.set(flowId, remaining);
			this.persist(flowId);
			return ack;
		} catch (error: unknown) {
			this.onError?.(error, flowId);
			throw error;
		} finally {
			performance.measure("daedalus.flow.patch.commit", {
				start: startedAt,
				end: performance.now(),
				detail: { operationCount: batch.length },
			});
		}
	}

	private schedule(flowId: string, delay: number): void {
		const existing = this.timers.get(flowId);
		if (existing !== undefined) window.clearTimeout(existing);
		this.timers.set(flowId, window.setTimeout((): void => {
			this.timers.delete(flowId);
			void this.flush(flowId).catch((): void => undefined);
		}, delay));
	}

	private hydrate(): Promise<void> {
		if (this.hydrated !== null) return this.hydrated;
		this.hydrated = window.electronAPI.flowOperationOutbox.load().then((stored): void => {
			for (const [flowId, values] of Object.entries(stored)) {
				const recovered = values.filter(isFlowOperation);
				const live = this.operations.get(flowId) ?? [];
				const liveIds = new Set(live.map((operation): string => operation.mutationId));
				const merged = [...recovered.filter((operation): boolean => !liveIds.has(operation.mutationId)), ...live];
				if (merged.length > 0) this.operations.set(flowId, merged);
			}
		});
		return this.hydrated;
	}

	private persist(flowId: string): void {
		const persistence = window.electronAPI.flowOperationOutbox.replace(flowId, this.operations.get(flowId) ?? []);
		this.persistence.set(flowId, persistence);
		void persistence.catch((error: unknown): void => this.onError?.(error, flowId)).finally((): void => {
			if (this.persistence.get(flowId) === persistence) this.persistence.delete(flowId);
		});
	}
}

export const flowOperationOutbox = new FlowOperationOutbox();

export function createFlowMutationId(): string {
	return `mutation-${crypto.randomUUID()}`;
}
