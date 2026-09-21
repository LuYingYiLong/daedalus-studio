import { useEffect, useRef } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { avoidFlowNodeOverlap, FLOW_NODE_MIN_HEIGHT, type FlowLayoutRect, type FlowLayoutUpdate } from "@/domain/flow/flow-node-layout";
import type { FlowRect } from "@/domain/flow/flow-render-stores";
import type { FlowInteractionNode } from "./FlowNodeShell";
import type { FlowCanvasEdge } from "./HomeFlowSurface";
import type { FlowLayoutActions, FlowRenderRuntime } from "./flow-render-runtime";

type Animation = {
	from: { x: number; y: number };
	to: FlowLayoutUpdate;
	started: number | null;
	duration: number;
	unsubscribe: () => void;
};
type FlowPosition = { x: number; y: number };

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
		// ReactFlow 的内部位置和文档快照在异步保存期间可能短暂不同。
		// 保留最近一次动画位置，避免下一次碰撞检测读到旧快照。
		const animatedPositions = new Map<string, FlowPosition>();
		const pendingResizeFrames = new Map<string, number>();
		const pending = new Map<string, { previous: string; stable: number; attempts: number }>();
		const starts = new Map<string, FlowRect>();
		const rect = (node: FlowInteractionNode): FlowLayoutRect => ({
			nodeId: node.id, ...node.position,
			width: node.measured?.width ?? node.width ?? runtime.document.get(node.id)?.width ?? 300,
			height: node.measured?.height ?? node.height ?? runtime.document.get(node.id)?.height ?? 180,
		});
		const cachedPosition = (node: FlowInteractionNode): FlowPosition | undefined => {
			const cached = animatedPositions.get(node.id);
			if (!cached || animations.has(node.id)) return cached;
			const saved = runtime.document.get(node.id);
			// 文档已经回滚且 ReactFlow 也回到了该位置时，丢弃旧动画缓存。
			// 若 ReactFlow 仍在旧快照与目标之间，则保留缓存等待下一次提交完成。
			if (saved && (saved.x !== cached.x || saved.y !== cached.y) && node.position.x === saved.x && node.position.y === saved.y) {
				animatedPositions.delete(node.id);
				return undefined;
			}
			return cached;
		};
		const cancelAnimation = (id: string): void => {
			animations.get(id)?.unsubscribe();
			animations.delete(id);
			runtime.animatingNodes.delete(id);
		};
		const cancelPendingResize = (id: string): void => {
			const frame = pendingResizeFrames.get(id);
			if (frame !== undefined) cancelAnimationFrame(frame);
			pendingResizeFrames.delete(id);
		};
		const cancelLayout = (id: string): void => {
			cancelPendingResize(id);
			cancelAnimation(id);
			animatedPositions.delete(id);
		};
		const animate = (now: number): void => {
			animationFrame = 0;
			if (disposed) return;
			flow.setNodes(nodes => nodes.map(node => {
				const animation = animations.get(node.id);
				if (!animation) return node;
				// Drag/resize start handlers cancel explicitly. ReactFlow's transient flags
				// can remain set for one frame after resize ends, so they must not cancel
				// an already scheduled avoidance animation here.
				// Start the clock on the first frame rather than when the task is queued. A
				// busy renderer must not consume the entire easing window before painting.
				animation.started ??= now;
				const progress = Math.min(1, (now - animation.started) / animation.duration);
				// Smoothstep keeps short avoidance moves visible instead of completing most
				// of their distance in the first few frames like ease-out cubic did.
				const eased = progress * progress * (3 - 2 * progress);
				const position = {
					x: animation.from.x + (animation.to.x - animation.from.x) * eased,
					y: animation.from.y + (animation.to.y - animation.from.y) * eased,
				};
				animatedPositions.set(node.id, progress === 1 ? { x: animation.to.x, y: animation.to.y } : position);
				if (progress === 1) cancelAnimation(node.id);
				return { ...node, position };
			}));
			if (animations.size) animationFrame = requestAnimationFrame(animate);
		};
		const settle = (id: string, resized?: FlowRect): void => {
			const nodes = flow.getNodes();
			const node = nodes.find(candidate => candidate.id === id);
			if (!node || disposed) return;
			const anchor = { ...rect(node), ...(cachedPosition(node) ?? {}), ...resized };
			// 连续添加时按上一轮动画的最终位置计算，避免避让到即将被占用的位置
			const destinations = nodes.map(other => {
				const animation = animations.get(other.id);
				const saved = runtime.document.get(other.id);
				const position = animation?.to ?? cachedPosition(other) ?? (saved ? { x: saved.x, y: saved.y } : other.position);
				return { ...rect(other), ...position };
			});
			const moves = avoidFlowNodeOverlap(anchor, destinations, options.current.snapToGrid ? [24, 24] : null);
			const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			for (const move of moves) {
				const other = nodes.find(candidate => candidate.id === move.nodeId)!;
				const from = cachedPosition(other) ?? other.position;
				cancelAnimation(other.id);
				runtime.animatingNodes.add(other.id);
				const distance = Math.hypot(move.x - from.x, move.y - from.y);
				const animation: Animation = {
					from: { ...from },
					to: move,
					started: null,
					// Layout jumps are disorienting even with reduced motion enabled, so keep
					// a brief spatial transition while limiting its duration substantially.
					duration: reducedMotion ? 160 : Math.min(480, 320 + distance * 0.4),
					unsubscribe: () => undefined,
				};
				animations.set(other.id, animation);
				// Undo、删除或外部位置修改优先于尚未结束的动画，不能被迟到帧覆盖
				animation.unsubscribe = runtime.document.subscribe(other.id, () => {
					const saved = runtime.document.get(other.id);
					if (!saved || saved.x !== move.x || saved.y !== move.y) {
						animatedPositions.delete(other.id);
						cancelAnimation(other.id);
						if (saved) flow.updateNode(other.id, { position: { x: saved.x, y: saved.y } });
					}
				});
			}
			// 只提交最终位置；缩放与避让属于同一个可撤销的布局操作
			if (animations.size && !animationFrame) animationFrame = requestAnimationFrame(animate);
			options.current.commit(resized ? [anchor, ...moves] : moves, resized ? undefined : id);
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
			cancelAnimation: cancelLayout,
			added: ids => {
				if (disposed) return;
				for (const id of ids) {
					pending.set(id, { previous: "", stable: 0, attempts: 0 });
					runtime.canvas.set(id, "full");
				}
				if (pending.size && !creationFrame) creationFrame = requestAnimationFrame(processCreated);
			},
			startResize: id => {
				cancelLayout(id);
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
				// XYFlow invokes onResizeEnd before it publishes the final resizing=false
				// change. Wait one frame so the avoidance pass cannot race that update.
				cancelPendingResize(id);
				pendingResizeFrames.set(id, requestAnimationFrame((): void => {
					pendingResizeFrames.delete(id);
					if (!disposed) settle(id, size);
				}));
			},
		};
		runtime.layout = actions;
		return () => {
			disposed = true;
			cancelAnimationFrame(animationFrame);
			cancelAnimationFrame(creationFrame);
			for (const frame of pendingResizeFrames.values()) cancelAnimationFrame(frame);
			pendingResizeFrames.clear();
			for (const id of animations.keys()) cancelAnimation(id);
			animatedPositions.clear();
			pending.clear();
			starts.clear();
			runtime.resizingNodes.clear();
			if (runtime.layout === actions) runtime.layout = null;
		};
	}, [runtime, flow]);
}
