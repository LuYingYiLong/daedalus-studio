import type {
	FlowDocumentNode,
	FlowDocumentEdge,
	FlowDocumentNodeRun,
	FlowDocumentSnapshot,
} from "@/platform/rpc/types";

export type FlowNodeRenderMode = "full" | "outline";
export type FlowRect = { x: number; y: number; width: number; height: number };
export type FlowViewport = { x: number; y: number; zoom: number };
type Listener = () => void;

export class FlowKeyedStore<T> {
	protected values = new Map<string, T>();
	private listeners = new Map<string, Set<Listener>>();
	private allListeners = new Set<Listener>();
	get = (id: string): T | undefined => this.values.get(id);
	entries = (): IterableIterator<[string, T]> => this.values.entries();
	subscribe = (id: string, listener: Listener): (() => void) => {
		let listeners = this.listeners.get(id);
		if (!listeners) this.listeners.set(id, (listeners = new Set()));
		listeners.add(listener);
		return () => {
			listeners!.delete(listener);
			if (!listeners!.size) this.listeners.delete(id);
		};
	};
	subscribeAll = (listener: Listener): (() => void) => {
		this.allListeners.add(listener);
		return () => {
			this.allListeners.delete(listener);
		};
	};
	set(id: string, value: T): void {
		if (Object.is(this.values.get(id), value)) return;
		this.values.set(id, value);
		this.publish(id);
	}
	delete(id: string): void {
		if (this.values.delete(id)) this.publish(id);
	}
	clear(): void {
		for (const id of [...this.values.keys()]) this.delete(id);
	}
	private publish(id: string): void {
		for (const listener of this.listeners.get(id) ?? []) listener();
		for (const listener of this.allListeners) listener();
	}
}

export class FlowDocumentStore extends FlowKeyedStore<FlowDocumentNode> {
	readonly editorFlushers = new Set<() => void>();
	flushEditors(): void {
		for (const flush of this.editorFlushers) flush();
	}
	readonly edges = new FlowKeyedStore<FlowDocumentEdge>();
	readonly incoming = new Map<string, Set<string>>();
	readonly outgoing = new Map<string, Set<string>>();
	flowId: string | null = null;
	replace(snapshot: FlowDocumentSnapshot | null): void {
		this.flowId = snapshot?.flow.flowId ?? null;
		const ids = new Set(snapshot?.nodes.map((node) => node.nodeId));
		for (const id of this.values.keys()) if (!ids.has(id)) this.delete(id);
		for (const node of snapshot?.nodes ?? []) this.set(node.nodeId, node);
		const edgeIds = new Set(snapshot?.edges.map((edge) => edge.edgeId));
		for (const [id, edge] of this.edges.entries())
			if (!edgeIds.has(id)) {
				this.unindex(edge);
				this.edges.delete(id);
			}
		for (const edge of snapshot?.edges ?? []) {
			const old = this.edges.get(edge.edgeId);
			if (old === edge) continue;
			if (old) this.unindex(old);
			for (const [index, nodeId] of [
				[this.incoming, edge.targetNodeId],
				[this.outgoing, edge.sourceNodeId],
			] as const) {
				let set = index.get(nodeId);
				if (!set) index.set(nodeId, (set = new Set()));
				set.add(edge.edgeId);
			}
			this.edges.set(edge.edgeId, edge);
		}
	}
	private unindex(edge: FlowDocumentEdge): void {
		for (const [index, nodeId] of [
			[this.incoming, edge.targetNodeId],
			[this.outgoing, edge.sourceNodeId],
		] as const) {
			const set = index.get(nodeId);
			set?.delete(edge.edgeId);
			if (!set?.size) index.delete(nodeId);
		}
	}
}

export class FlowRunStore extends FlowKeyedStore<FlowDocumentNodeRun> {
	private flowId: string | null = null;
	override set(nodeId: string, nodeRun: FlowDocumentNodeRun): void {
		const previous = this.get(nodeId);
		const hasPreviousOutput = previous?.output !== null && previous?.output !== undefined;
		const hasAuthoritativeOutput = ["completed", "cached", "partial_failure"].includes(nodeRun.status);
		super.set(
			nodeId,
			!hasAuthoritativeOutput && hasPreviousOutput ? { ...nodeRun, output: previous.output } : nodeRun,
		);
	}
	replace(
		flowId: string | null,
		nodeIds: readonly string[],
		latestNodeResults: readonly FlowDocumentNodeRun[],
		currentRunNodes: readonly FlowDocumentNodeRun[],
	): void {
		if (this.flowId !== flowId) {
			this.clear();
			this.flowId = flowId;
		}
		const retainedNodeIds = new Set(nodeIds);
		for (const [nodeId] of this.entries()) if (!retainedNodeIds.has(nodeId)) this.delete(nodeId);
		for (const nodeRun of latestNodeResults) this.set(nodeRun.nodeId, nodeRun);
		for (const nodeRun of currentRunNodes) this.set(nodeRun.nodeId, nodeRun);
	}
}

type Draft = {
	config: Record<string, unknown>;
	commit: (config: Record<string, unknown>) => void;
	timer: ReturnType<typeof setTimeout> | null;
	dirty: boolean;
};
export class FlowCanvasStore extends FlowKeyedStore<FlowNodeRenderMode> {
	generation = 0;
	viewport: FlowViewport = { x: 0, y: 0, zoom: 1 };
	interaction = false;
	readonly editing = new Set<string>();
	readonly editGroups = new Map<string, string>();
	private nextEditGroup = 0;
	readonly playing = new Set<string>();
	readonly popups = new Set<string>();
	readonly pluginEditors = new Set<string>();
	readonly composing = new Set<string>();
	readonly collapsed = new FlowKeyedStore<boolean>();
	readonly titleRenameRequests = new FlowKeyedStore<number>();
	readonly drafts = new FlowKeyedStore<Record<string, unknown>>();
	readonly rawFields = new Map<string, string>();
	private listItemKeys = new Map<string, string[]>();
	getListItemKeys(fieldId: string, length: number): readonly string[] {
		const keys = this.listItemKeys.get(fieldId) ?? [];
		for (const key of keys.slice(length)) this.rawFields.delete(`${fieldId}\u0000${key}`);
		keys.length = Math.min(keys.length, length);
		while (keys.length < length) keys.push(crypto.randomUUID());
		this.listItemKeys.set(fieldId, keys);
		return keys;
	}
	removeListItem(fieldId: string, index: number): void {
		const key = this.listItemKeys.get(fieldId)?.splice(index, 1)[0];
		if (key !== undefined) this.rawFields.delete(`${fieldId}\u0000${key}`);
	}
	private pendingDrafts = new Map<string, Draft>();
	private detail: boolean | null = null;
	getMode = (id: string): FlowNodeRenderMode => this.get(id) ?? "outline";
	requestTitleRename(id: string): void {
		this.pin(id, true);
		this.titleRenameRequests.set(id, (this.titleRenameRequests.get(id) ?? 0) + 1);
	}
	updateDetail(zoom: number): boolean {
		// 初次打开，显示完整控件
		if (this.detail === null) this.detail = zoom >= 0.5;
		// 切换轮廓
		else if (zoom <= 0.15) this.detail = false;
		// 恢复完整控件
		else if (zoom >= 0.25) this.detail = true;
		return this.detail;
	}
	pin(id: string, editing: boolean): void {
		if (editing) {
			if (!this.editing.has(id)) this.editGroups.set(id, `${this.generation}:${id}:${++this.nextEditGroup}`);
			this.editing.add(id);
			this.set(id, "full");
		} else {
			this.editing.delete(id);
			this.editGroups.delete(id);
		}
	}
	updateDraft(id: string, config: Record<string, unknown>, commit: Draft["commit"], immediate: boolean): void {
		const previous = this.pendingDrafts.get(id);
		if (previous?.timer) clearTimeout(previous.timer);
		this.drafts.set(id, config);
		const draft: Draft = { config, commit, timer: null, dirty: true };
		this.pendingDrafts.set(id, draft);
		if (immediate) this.flushDraft(id);
		else if (!this.composing.has(id)) draft.timer = setTimeout(() => this.flushDraft(id), 250);
	}
	flushDraft(id: string): void {
		const draft = this.pendingDrafts.get(id);
		if (!draft) return;
		if (draft.timer) clearTimeout(draft.timer);
		draft.timer = null;
		if (draft.dirty) {
			draft.dirty = false;
			draft.commit(draft.config);
		}
	}
	acceptConfig(id: string, config: Record<string, unknown>): void {
		if (this.pendingDrafts.get(id)?.dirty) return;
		this.drafts.set(id, config);
	}
	removeNode(id: string): void {
		this.collapsed.delete(id);
		this.titleRenameRequests.delete(id);
		for (const key of this.rawFields.keys()) if (key.startsWith(`${id}\u0000`)) this.rawFields.delete(key);
		for (const key of this.listItemKeys.keys()) if (key.startsWith(`${id}\u0000`)) this.listItemKeys.delete(key);
		const draft = this.pendingDrafts.get(id);
		if (draft?.timer) clearTimeout(draft.timer);
		this.pendingDrafts.delete(id);
		this.drafts.delete(id);
		this.editing.delete(id);
		this.editGroups.delete(id);
		this.playing.delete(id);
		this.popups.delete(id);
		this.pluginEditors.delete(id);
		this.composing.delete(id);
		this.delete(id);
	}
	flush(): void {
		for (const id of this.pendingDrafts.keys()) this.flushDraft(id);
	}
	dispose(): void {
		this.flush();
		this.collapsed.clear();
		this.titleRenameRequests.clear();
		this.generation++;
		this.pendingDrafts.clear();
		this.drafts.clear();
		this.rawFields.clear();
		this.listItemKeys.clear();
		this.editing.clear();
		this.editGroups.clear();
		this.playing.clear();
		this.popups.clear();
		this.pluginEditors.clear();
		this.composing.clear();
		this.clear();
		this.detail = null;
	}
}

export function intersectsFlowRect(a: FlowRect, b: FlowRect): boolean {
	return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

// 巨大连线使用单独集合，避免一条跨图曲线创建数百万个网格单元
export class FlowSpatialIndex {
	private cells = new Map<string, Set<string>>();
	private items = new Map<string, { rect: FlowRect; cells: string[] }>();
	private large = new Set<string>();
	constructor(private cellSize = 512) {}
	private keys(rect: FlowRect): string[] {
		const left = Math.floor(rect.x / this.cellSize),
			right = Math.floor((rect.x + rect.width) / this.cellSize);
		const top = Math.floor(rect.y / this.cellSize),
			bottom = Math.floor((rect.y + rect.height) / this.cellSize);
		if ((right - left + 1) * (bottom - top + 1) > 256) return [];
		const keys: string[] = [];
		for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) keys.push(`${x}:${y}`);
		return keys;
	}
	set(id: string, rect: FlowRect): void {
		const old = this.items.get(id)?.rect;
		if (old && old.x === rect.x && old.y === rect.y && old.width === rect.width && old.height === rect.height)
			return;
		this.delete(id);
		const keys = this.keys(rect);
		this.items.set(id, { rect, cells: keys });
		if (!keys.length) this.large.add(id);
		for (const key of keys) {
			let cell = this.cells.get(key);
			if (!cell) this.cells.set(key, (cell = new Set()));
			cell.add(id);
		}
	}
	delete(id: string): void {
		for (const key of this.items.get(id)?.cells ?? []) {
			const cell = this.cells.get(key)!;
			cell.delete(id);
			if (!cell.size) this.cells.delete(key);
		}
		this.large.delete(id);
		this.items.delete(id);
	}
	query(rect: FlowRect): Set<string> {
		const keys = this.keys(rect),
			candidates = new Set(keys.length ? this.large : this.items.keys());
		for (const key of keys) for (const id of this.cells.get(key) ?? []) candidates.add(id);
		return new Set([...candidates].filter((id) => intersectsFlowRect(this.items.get(id)!.rect, rect)));
	}
	clear(): void {
		this.cells.clear();
		this.items.clear();
		this.large.clear();
	}
}

export type FlowHandleGeometry = {
	id: string;
	type: "source" | "target";
	x: number;
	y: number;
	width: number;
	height: number;
	position: "left" | "right" | "top" | "bottom";
};
export type FlowNodeGeometry = FlowRect & { handles: FlowHandleGeometry[]; color: string; selected: boolean };
export class FlowGeometryStore extends FlowKeyedStore<FlowNodeGeometry> {
	readonly nodes = new FlowSpatialIndex();
	readonly edges = new FlowSpatialIndex();
	override set(id: string, value: FlowNodeGeometry): void {
		const old = this.get(id);
		if (
			old &&
			old.x === value.x &&
			old.y === value.y &&
			old.width === value.width &&
			old.height === value.height &&
			old.selected === value.selected &&
			old.color === value.color &&
			old.handles.length === value.handles.length &&
			old.handles.every((handle, index) => {
				const next = value.handles[index]!;
				return (
					handle.id === next.id &&
					handle.type === next.type &&
					handle.position === next.position &&
					handle.x === next.x &&
					handle.y === next.y &&
					handle.width === next.width &&
					handle.height === next.height
				);
			})
		)
			return;
		this.nodes.set(id, value);
		super.set(id, value);
	}
	override delete(id: string): void {
		this.nodes.delete(id);
		super.delete(id);
	}
}
