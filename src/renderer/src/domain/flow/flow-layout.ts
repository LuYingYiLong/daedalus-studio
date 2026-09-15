import dagre from "@dagrejs/dagre";
import type {
	ConversationFlowNode,
	ConversationFlowNodePosition,
} from "@/platform/rpc/types";

export const FLOW_NODE_WIDTH: number = 300;
export const FLOW_NODE_HEIGHT: number = 168;

export function layoutFlowNodes(
	nodes: readonly ConversationFlowNode[],
	positions: readonly ConversationFlowNodePosition[],
): Map<string, { x: number; y: number }> {
	const graph = new dagre.graphlib.Graph();
	graph.setGraph({ rankdir: "LR", ranksep: 96, nodesep: 44, marginx: 48, marginy: 48 });
	graph.setDefaultEdgeLabel((): Record<string, never> => ({}));
	for (const node of nodes) graph.setNode(node.nodeId, { width: FLOW_NODE_WIDTH, height: FLOW_NODE_HEIGHT });
	for (const node of nodes) {
		if (node.parentNodeId !== null && nodes.some((candidate): boolean => candidate.nodeId === node.parentNodeId)) {
			graph.setEdge(node.parentNodeId, node.nodeId);
		}
	}
	dagre.layout(graph);
	const saved: Map<string, ConversationFlowNodePosition> = new Map(
		positions.map((position): [string, ConversationFlowNodePosition] => [position.nodeId, position]),
	);
	return new Map(nodes.map((node): [string, { x: number; y: number }] => {
		const savedPosition = saved.get(node.nodeId);
		if (savedPosition !== undefined) return [node.nodeId, { x: savedPosition.x, y: savedPosition.y }];
		const point = graph.node(node.nodeId) as { x: number; y: number };
		return [node.nodeId, { x: point.x - FLOW_NODE_WIDTH / 2, y: point.y - FLOW_NODE_HEIGHT / 2 }];
	}));
}
