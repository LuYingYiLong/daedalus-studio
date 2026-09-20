import { FlowSpatialIndex, type FlowRect } from "./flow-render-stores";

export type FlowLayoutRect = FlowRect & { nodeId: string };
export type FlowLayoutUpdate = { nodeId: string; x: number; y: number; width?: number; height?: number };
export const FLOW_NODE_MIN_WIDTH = 240;
export const FLOW_NODE_MIN_HEIGHT = 176;
export const FLOW_NODE_CLEARANCE = 24;

function overlaps(a: FlowRect, b: FlowRect, gap: number): boolean {
	return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
		a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

/** 固定触发节点，只传播由它造成的碰撞；已有的无关重叠保持原样 */
export function avoidFlowNodeOverlap(
	anchor: FlowLayoutRect,
	nodes: readonly FlowLayoutRect[],
	snapGrid: readonly [number, number] | null,
): FlowLayoutUpdate[] {
	const center = { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
	const distance = (node: FlowLayoutRect): number =>
		Math.hypot(node.x + node.width / 2 - center.x, node.y + node.height / 2 - center.y);
	const sorted = nodes.filter(node => node.nodeId !== anchor.nodeId)
		.sort((a, b) => distance(a) - distance(b) || a.nodeId.localeCompare(b.nodeId));
	const placed = new Map<string, FlowLayoutRect>([[anchor.nodeId, anchor]]);
	const index = new FlowSpatialIndex();
	index.set(anchor.nodeId, anchor);
	const affected = new Set([anchor.nodeId]);
	const moved: FlowLayoutUpdate[] = [];
	const collisions = (node: FlowLayoutRect): FlowLayoutRect[] => [...index.query({
		x: node.x - FLOW_NODE_CLEARANCE, y: node.y - FLOW_NODE_CLEARANCE,
		width: node.width + FLOW_NODE_CLEARANCE * 2, height: node.height + FLOW_NODE_CLEARANCE * 2,
	})].map(id => placed.get(id)!).filter(other => overlaps(node, other, FLOW_NODE_CLEARANCE));
	for (const original of sorted) {
		let node = { ...original };
		let blockers = collisions(node);
		if (blockers.some(blocker => affected.has(blocker.nodeId))) {
			let dx = node.x + node.width / 2 - center.x;
			const dy = node.y + node.height / 2 - center.y;
			if (dx === 0 && dy === 0) dx = 1;
			// 沿中心向外的射线推进，每次至少越过一个障碍，避免密集布局来回抖动
			for (let step = 0; blockers.length && step <= placed.size; step++) {
				let advance = 0;
				for (const blocker of blockers) {
					const tx = dx > 0 ? (blocker.x + blocker.width + FLOW_NODE_CLEARANCE - node.x) / dx
						: dx < 0 ? (blocker.x - FLOW_NODE_CLEARANCE - node.x - node.width) / dx : Infinity;
					const ty = dy > 0 ? (blocker.y + blocker.height + FLOW_NODE_CLEARANCE - node.y) / dy
						: dy < 0 ? (blocker.y - FLOW_NODE_CLEARANCE - node.y - node.height) / dy : Infinity;
					advance = Math.max(advance, Math.min(tx, ty));
				}
				node.x += dx * (advance + 1e-7);
				node.y += dy * (advance + 1e-7);
				if (snapGrid) {
					if (dx !== 0) node.x = (dx > 0 ? Math.ceil : Math.floor)(node.x / snapGrid[0]) * snapGrid[0];
					if (dy !== 0) node.y = (dy > 0 ? Math.ceil : Math.floor)(node.y / snapGrid[1]) * snapGrid[1];
				}
				blockers = collisions(node);
			}
			affected.add(node.nodeId);
			moved.push({ nodeId: node.nodeId, x: node.x, y: node.y });
		}
		placed.set(node.nodeId, node);
		index.set(node.nodeId, node);
	}
	return moved;
}
