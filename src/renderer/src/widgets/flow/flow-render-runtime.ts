import { createContext } from "react";
import {
	FlowCanvasStore,
	FlowDocumentStore,
	FlowGeometryStore,
	FlowKeyedStore,
	FlowRunStore,
} from "@/domain/flow/flow-render-stores";
import type { FlowCanvasNodeData } from "./FlowNodes";

export class FlowRenderRuntime {
	readonly canvas = new FlowCanvasStore();
	readonly geometry = new FlowGeometryStore();
	readonly views = new FlowKeyedStore<FlowCanvasNodeData>();
	readonly selectedEdges = new Set<string>();
	constructor(
		readonly document: FlowDocumentStore,
		readonly runs: FlowRunStore,
	) {}
	dispose(): void {
		this.canvas.dispose();
		this.views.clear();
		this.geometry.clear();
		this.geometry.edges.clear();
		this.selectedEdges.clear();
	}
}
export const FlowRenderContext = createContext<FlowRenderRuntime | null>(null);
