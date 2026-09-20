import { memo, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { FlowDocumentNodeView } from "./FlowNodes";
import { FlowRenderContext, type FlowRenderRuntime } from "./flow-render-runtime";

export type FlowInteractionNode = Node<{ nodeId: string; runtime: FlowRenderRuntime }, "flowNode">;

function FlowNodeShell({ data, selected }: NodeProps<FlowInteractionNode>): React.JSX.Element | null {
	const { nodeId, runtime } = data;
	const subscribe = useCallback((listener: () => void) => runtime.views.subscribe(nodeId, listener), [runtime, nodeId]);
	const view = useSyncExternalStore(subscribe, () => runtime.views.get(nodeId));
	const mode = useSyncExternalStore(
		useCallback((listener) => runtime.canvas.subscribe(nodeId, listener), [runtime, nodeId]),
		() => runtime.canvas.getMode(nodeId),
	);
	const nodeRun = useSyncExternalStore(
		useCallback((listener) => runtime.runs.subscribe(nodeId, listener), [runtime, nodeId]),
		() => runtime.runs.get(nodeId),
	);
	const geometry = useSyncExternalStore(
		useCallback((listener) => runtime.geometry.subscribe(nodeId, listener), [runtime, nodeId]),
		() => runtime.geometry.get(nodeId),
	);
	const shellRef = useRef<HTMLDivElement>(null);
	const flow = useReactFlow();
	const fullData = useMemo(() => (view ? { ...view, nodeRun: nodeRun ?? null } : null), [view, nodeRun]);
	useEffect(
		() => () => {
			runtime.canvas.pin(nodeId, false);
		},
		[runtime, nodeId],
	);
	if (!view) return null;
	const edit = (): void => {
		runtime.canvas.pin(nodeId, true);
		const node = flow.getInternalNode(nodeId);
		if (node)
			void flow
				.setCenter(
					node.internals.positionAbsolute.x + (geometry?.width ?? 320) / 2,
					node.internals.positionAbsolute.y + (geometry?.height ?? 176) / 2,
					{ zoom: Math.max(0.75, flow.getZoom()), duration: 180 },
				)
				.then(() => {
					shellRef.current?.querySelector<HTMLElement>('input,textarea,button,[tabindex="0"]')?.focus();
				});
	};
	return (
		<FlowRenderContext.Provider value={runtime}>
			<div
				ref={shellRef}
				data-flow-shell={nodeId}
				data-flow-render-mode={mode}
				style={
					mode === "outline"
						? { width: geometry?.width ?? 320, height: geometry?.height ?? view.flowNode.height ?? 176 }
						: { width: 320 }
				}
				onDoubleClick={() => {
					if (mode === "outline") edit();
				}}
				onKeyDown={(event) => {
					if (
						event.key === "Enter" &&
						!(event.target as Element).closest("input,textarea,button,[contenteditable=true]")
					) {
						event.stopPropagation();
						edit();
					}
					if (event.key === "Escape") {
						(document.activeElement as HTMLElement | null)?.blur();
						runtime.canvas.pin(nodeId, false);
					}
				}}
				onFocusCapture={(event) => {
					if (!(event.target as Element).closest("video,audio")) runtime.canvas.pin(nodeId, true);
				}}
				onBlurCapture={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
						runtime.canvas.flushDraft(nodeId);
						runtime.canvas.pin(nodeId, false);
					}
				}}
				onCompositionStartCapture={() => {
					runtime.canvas.composing.add(nodeId);
					runtime.canvas.pin(nodeId, true);
				}}
				onCompositionEndCapture={() => {
					runtime.canvas.composing.delete(nodeId);
					runtime.canvas.flushDraft(nodeId);
				}}
				onPlayCapture={() => runtime.canvas.playing.add(nodeId)}
				onPauseCapture={() => runtime.canvas.playing.delete(nodeId)}
			>
				{mode === "full" && fullData ? (
					<FlowDocumentNodeView data={fullData} selected={selected} />
				) : (
					geometry?.handles.map((handle) => (
						<Handle
							key={`${handle.type}:${handle.id}`}
							id={handle.id}
							type={handle.type}
							position={handle.position as Position}
							isConnectable={false}
							style={{
								left: handle.x + handle.width / 2,
								top: handle.y + handle.height / 2,
								right: "auto",
								bottom: "auto",
								width: handle.width,
								height: handle.height,
								boxSizing: "border-box",
								transform: "translate(-50%, -50%)",
								visibility: "hidden",
								pointerEvents: "none",
							}}
						/>
					))
				)}
			</div>
		</FlowRenderContext.Provider>
	);
}
export default memo(FlowNodeShell);
