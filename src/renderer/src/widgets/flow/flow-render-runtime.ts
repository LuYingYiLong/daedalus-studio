import { createContext } from "react";
import {
	FlowCanvasStore,
	FlowDocumentStore,
	FlowGeometryStore,
	FlowKeyedStore,
	FlowRunStore,
} from "@/domain/flow/flow-render-stores";
import type { FlowCanvasNodeData } from "./FlowNodes";
import type { FlowRect } from "@/domain/flow/flow-render-stores";

export type FlowLayoutActions = {
	startResize: (nodeId: string) => void;
	finishResize: (nodeId: string, rect: FlowRect) => void;
	added: (nodeIds: readonly string[]) => void;
	cancelAnimation: (nodeId: string) => void;
};

export class FlowRenderRuntime {
	readonly canvas = new FlowCanvasStore();
	readonly geometry = new FlowGeometryStore();
	readonly views = new FlowKeyedStore<FlowCanvasNodeData>();
	readonly selectedEdges = new Set<string>();
	readonly resizingNodes = new Set<string>();
	readonly animatingNodes = new Set<string>();
	layout: FlowLayoutActions | null = null;
	constructor(
		readonly document: FlowDocumentStore,
		readonly runs: FlowRunStore,
	) {}
	dispose(): void {
		this.layout = null;
		this.resizingNodes.clear();
		this.animatingNodes.clear();
		this.canvas.dispose();
		this.views.clear();
		this.geometry.clear();
		this.geometry.edges.clear();
		this.selectedEdges.clear();
	}
}
export const FlowRenderContext = createContext<FlowRenderRuntime | null>(null);
