import { useEffect, useRef } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { avoidFlowNodeOverlap, FLOW_NODE_MIN_HEIGHT, type FlowLayoutRect, type FlowLayoutUpdate } from "@/domain/flow/flow-node-layout";
import type { FlowRect } from "@/domain/flow/flow-render-stores";
import type { FlowInteractionNode } from "./FlowNodeShell";
import type { FlowCanvasEdge } from "./HomeFlowSurface";
import type { FlowLayoutActions, FlowRenderRuntime } from "./flow-render-runtime";

type Animation = { from: { x: number; y: number }; to: FlowLayoutUpdate; started: number; unsubscribe: () => void };

export function useFlowNodeLayout(
	runtime: FlowRenderRuntime,
	flow: ReactFlowInstance<FlowInteractionNode, FlowCanvasEdge> | null,
	snapToGrid: boolean,
	commit: (layouts: readonly FlowLayoutUpdate[], createdNodeId?: string) => void,
): void {
	const options = useRef({ snapToGrid, commit });
	options.current = { snapToGrid, commit };
	useEffect(() => {
		if (!flow) return;
		let disposed = false, animationFrame = 0, creationFrame = 0;
		const animations = new Map<string, Animation>();
		const pending = new Map<string, { previous: string; stable: number; attempts: number }>();
		const starts = new Map<string, FlowRect>();
		const rect = (node: FlowInteractionNode): FlowLayoutRect => ({
			nodeId: node.id, ...node.position,
			width: node.measured?.width ?? node.width ?? runtime.document.get(node.id)?.width ?? 300,
			height: node.measured?.height ?? node.height ?? runtime.document.get(node.id)?.height ?? 180,
		});
		const cancelAnimation = (id: string): void => {
			animations.get(id)?.unsubscribe();
			animations.delete(id);
			runtime.animatingNodes.delete(id);
		};
		const animate = (now: number): void => {
			animationFrame = 0;
			if (disposed) return;
			flow.setNodes(nodes => nodes.map(node => {
				const animation = animations.get(node.id);
				if (!animation) return node;
				if (node.dragging || node.resizing) { cancelAnimation(node.id); return node; }
				const progress = Math.min(1, (now - animation.started) / 280);
				const eased = 1 - Math.pow(1 - progress, 3);
				if (progress === 1) cancelAnimation(node.id);
				return { ...node, position: {
					x: animation.from.x + (animation.to.x - animation.from.x) * eased,
					y: animation.from.y + (animation.to.y - animation.from.y) * eased,
				} };
			}));
			if (animations.size) animationFrame = requestAnimationFrame(animate);
		};
		const settle = (id: string, resized?: FlowRect): void => {
			const nodes = flow.getNodes();
			const node = nodes.find(candidate => candidate.id === id);
			if (!node || disposed) return;
			const anchor = { ...rect(node), ...resized };
			// 连续添加时按上一轮动画的最终位置计算，避免避让到即将被占用的位置
			const destinations = nodes.map(other => ({ ...rect(other), ...animations.get(other.id)?.to }));
			const moves = avoidFlowNodeOverlap(anchor, destinations, options.current.snapToGrid ? [24, 24] : null);
			const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			for (const move of moves) {
				const other = nodes.find(candidate => candidate.id === move.nodeId)!;
				cancelAnimation(other.id);
				if (reducedMotion) continue;
				runtime.animatingNodes.add(other.id);
				const animation: Animation = {
					from: { ...other.position }, to: move, started: performance.now(), unsubscribe: () => undefined,
				};
				animations.set(other.id, animation);
				// Undo、删除或外部位置修改优先于尚未结束的动画，不能被迟到帧覆盖
				animation.unsubscribe = runtime.document.subscribe(other.id, () => {
					const saved = runtime.document.get(other.id);
					if (!saved || saved.x !== move.x || saved.y !== move.y) {
						cancelAnimation(other.id);
						if (saved) flow.updateNode(other.id, { position: { x: saved.x, y: saved.y } });
					}
				});
			}
			// 只提交最终位置；缩放与避让属于同一个可撤销的布局操作
			options.current.commit(resized ? [anchor, ...moves] : moves, resized ? undefined : id);
			if (animations.size && !animationFrame) animationFrame = requestAnimationFrame(animate);
		};
		const processCreated = (): void => {
			creationFrame = 0;
			if (disposed) return;
			for (const [id, state] of pending) {
				const node = flow.getNode(id);
				state.attempts++;
				if (node?.measured?.width && node.measured.height) {
					const size = `${node.measured.width}:${node.measured.height}`;
					state.stable = size === state.previous ? state.stable + 1 : 0;
					state.previous = size;
					if (state.stable >= 2) { pending.delete(id); settle(id); }
				}
				if (state.attempts >= 120) pending.delete(id);
			}
			if (pending.size) creationFrame = requestAnimationFrame(processCreated);
		};
		const actions: FlowLayoutActions = {
			cancelAnimation,
			added: ids => {
				if (disposed) return;
				for (const id of ids) {
					pending.set(id, { previous: "", stable: 0, attempts: 0 });
					runtime.canvas.set(id, "full");
				}
				if (pending.size && !creationFrame) creationFrame = requestAnimationFrame(processCreated);
			},
			startResize: id => {
				cancelAnimation(id);
				const node = flow.getNode(id);
				if (!node) return;
				const initial = rect(node);
				starts.set(id, initial);
				runtime.resizingNodes.add(id);
				// 降低最小高度以允许缩小前，固定当前实测高度，避免按下边角时先塌缩
				flow.updateNode(id, { height: initial.height, style: { ...node.style, minHeight: FLOW_NODE_MIN_HEIGHT } });
			},
			finishResize: (id, size) => {
				runtime.resizingNodes.delete(id);
				const start = starts.get(id);
				starts.delete(id);
				if (!start) return;
				if (start.width === size.width && start.height === size.height && start.x === size.x && start.y === size.y) {
					const node = flow.getNode(id);
					if (node) flow.updateNode(id, {
						height: undefined,
						style: { ...node.style, height: undefined, minHeight: runtime.document.get(id)?.height ?? start.height },
					});
					return;
				}
				settle(id, size);
			},
		};
		runtime.layout = actions;
		return () => {
			disposed = true;
			cancelAnimationFrame(animationFrame);
			cancelAnimationFrame(creationFrame);
			for (const id of animations.keys()) cancelAnimation(id);
			pending.clear();
			starts.clear();
			runtime.resizingNodes.clear();
			if (runtime.layout === actions) runtime.layout = null;
		};
	}, [runtime, flow]);
}
