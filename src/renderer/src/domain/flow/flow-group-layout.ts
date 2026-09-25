import type { FlowDocumentGroup, FlowDocumentNode } from "@/platform/rpc/types";

export type FlowGroupFrame = Pick<FlowDocumentGroup, "groupId" | "x" | "y" | "width" | "height">;

const HORIZONTAL_PADDING = 24;
const HEADER_SPACE = 48;
const BOTTOM_PADDING = 24;

export function layoutFlowGroupFrames(
	groups: readonly FlowDocumentGroup[],
	nodes: readonly FlowDocumentNode[],
): FlowGroupFrame[] {
	const groupById = new Map(groups.map((group): [string, FlowDocumentGroup] => [group.groupId, group]));
	const nodeById = new Map(nodes.map((node): [string, FlowDocumentNode] => [node.nodeId, node]));
	const children = new Map<string, FlowDocumentGroup[]>();
	for (const group of groups) {
		if (group.parentGroupId === null) continue;
		const siblings = children.get(group.parentGroupId) ?? [];
		siblings.push(group);
		children.set(group.parentGroupId, siblings);
	}
	const cache = new Map<string, FlowGroupFrame>();
	const resolving = new Set<string>();
	const resolve = (groupId: string): FlowGroupFrame | undefined => {
		const cached = cache.get(groupId);
		if (cached) return cached;
		const group = groupById.get(groupId);
		if (!group) return undefined;
		if (resolving.has(groupId)) return { groupId, x: group.x, y: group.y, width: group.width, height: group.height };
		resolving.add(groupId);
		const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
		for (const nodeId of group.nodeIds) {
			const node = nodeById.get(nodeId);
			if (node) rects.push({ x: node.x, y: node.y, width: node.width, height: node.collapsed ? 40 : node.height });
		}
		for (const child of children.get(groupId) ?? []) {
			const frame = resolve(child.groupId);
			if (frame) rects.push(frame);
		}
		resolving.delete(groupId);
		const frame = rects.length === 0
			? { groupId, x: group.x, y: group.y, width: group.width, height: group.height }
			: {
				groupId,
				x: Math.min(...rects.map((rect) => rect.x)) - HORIZONTAL_PADDING,
				y: Math.min(...rects.map((rect) => rect.y)) - HEADER_SPACE,
				width: Math.max(...rects.map((rect) => rect.x + rect.width)) - Math.min(...rects.map((rect) => rect.x)) + HORIZONTAL_PADDING * 2,
				height: Math.max(...rects.map((rect) => rect.y + rect.height)) - Math.min(...rects.map((rect) => rect.y)) + HEADER_SPACE + BOTTOM_PADDING,
			};
		cache.set(groupId, frame);
		return frame;
	};
	return groups.flatMap((group): FlowGroupFrame[] => {
		const frame = resolve(group.groupId);
		return frame ? [frame] : [];
	});
}
