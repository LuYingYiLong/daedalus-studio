import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { Handle, NodeResizeControl, Position, useReactFlow, type Node, type NodeProps, type OnResizeEnd, type ShouldResize } from "@xyflow/react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import { FLOW_NODE_MIN_HEIGHT, FLOW_NODE_MIN_WIDTH } from "@/domain/flow/flow-node-layout";
import { FlowDocumentNodeView } from "./FlowNodes";
import { FlowRenderContext, type FlowRenderRuntime } from "./flow-render-runtime";
import { flowNodeResizeHandleColor } from "./flow-node-category-colors";
import styles from "./FlowNodes.module.css";

export type FlowInteractionNode = Node<{ nodeId: string; runtime: FlowRenderRuntime; layoutWidth?: number; layoutHeight?: number }, "flowNode">;

const RESIZE_CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

function FlowNodeShell({ data, selected }: NodeProps<FlowInteractionNode>): React.JSX.Element | null {
	const { t } = useTranslation();
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
	const collapsed = useSyncExternalStore(
		useCallback(listener => runtime.canvas.collapsed.subscribe(nodeId, listener), [runtime, nodeId]),
		() => runtime.canvas.collapsed.get(nodeId) ?? false,
	);
	const geometry = useSyncExternalStore(
		useCallback((listener) => runtime.geometry.subscribe(nodeId, listener), [runtime, nodeId]),
		() => runtime.geometry.get(nodeId),
	);
	const shellRef = useRef<HTMLDivElement>(null);
	const minimumHeight = useRef(FLOW_NODE_MIN_HEIGHT);
	const flow = useReactFlow();
	const toggleCollapsed = useCallback((): void => {
		runtime.canvas.flushDraft(nodeId);
		runtime.canvas.pin(nodeId, false);
		runtime.canvas.popups.delete(nodeId);
		runtime.canvas.pluginEditors.delete(nodeId);
		runtime.canvas.playing.delete(nodeId);
		const collapsed = !(runtime.canvas.collapsed.get(nodeId) ?? false);
		runtime.views.get(nodeId)?.onAction(nodeId, collapsed ? "collapse" : "expand");
	}, [runtime, nodeId]);
	useLayoutEffect(() => {
		const node = flow.getNode(nodeId);
		if (!node) return;
		// 折叠仅改变画布展示，不覆盖用户保存的展开尺寸
		const minHeight = collapsed ? 0 : runtime.document.get(nodeId)?.height;
		if (node.height !== undefined || node.style?.minHeight !== minHeight)
			flow.updateNode(nodeId, { height: undefined, style: { ...node.style, height: undefined, minHeight } });
	}, [collapsed, flow, nodeId, runtime]);
	const startResize = useCallback((): void => {
		if (shellRef.current) shellRef.current.dataset.flowResizing = "true";
		runtime.layout?.startResize(nodeId);
	}, [runtime, nodeId]);
	const finishResize = useCallback<OnResizeEnd>((_event, size): void => {
		if (shellRef.current) delete shellRef.current.dataset.flowResizing;
		runtime.layout?.finishResize(nodeId, size);
	}, [runtime, nodeId]);
	const shouldResize = useCallback<ShouldResize>((_event, size): boolean => size.height >= minimumHeight.current, []);
	useEffect(() => {
		if (mode !== "full" || collapsed) return;
		const card = shellRef.current?.querySelector("article");
		const header = card?.querySelector("header");
		const body = header?.nextElementSibling as HTMLElement | null;
		if (!header || !body) return;
		const measure = (): void => {
			const style = getComputedStyle(body);
			const children = [...body.children] as HTMLElement[];
			minimumHeight.current = Math.max(FLOW_NODE_MIN_HEIGHT, header.offsetHeight + 4 +
				parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) +
				children.reduce((sum, child) => {
					const childStyle = getComputedStyle(child);
					// 弹性预览只计最低高度，不能把扩展后的高度当作禁止缩小的下限
					return sum + (Number(childStyle.flexGrow) > 0 ? parseFloat(childStyle.minHeight) || 0 : child.offsetHeight);
				}, 0) +
				Math.max(0, children.length - 1) * (parseFloat(style.rowGap) || 0));
		};
		const observer = new ResizeObserver(measure);
		const observe = (): void => {
			observer.disconnect();
			observer.observe(header);
			for (const child of body.children) observer.observe(child);
			measure();
		};
		const mutations = new MutationObserver(observe);
		mutations.observe(body, { childList: true });
		observe();
		return () => { observer.disconnect(); mutations.disconnect(); };
	}, [mode, collapsed]);
	const fullData = useMemo(() => (view ? { ...view, nodeRun: nodeRun ?? null } : null), [view, nodeRun]);
	useEffect(
		() => () => {
			runtime.canvas.pin(nodeId, false);
		},
		[runtime, nodeId],
	);
	if (!view) return null;
	const shellStyle = {
		...(mode === "outline"
			? { width: geometry?.width ?? view.flowNode.width, height: geometry?.height ?? view.flowNode.height }
			: { width: "100%", height: collapsed ? "auto" : "100%", minHeight: collapsed ? 0 : "inherit" }),
		"--flow-resize-handle-color": flowNodeResizeHandleColor(view.definition?.category),
	} as CSSProperties & { "--flow-resize-handle-color": string };
	const edit = (): void => {
		if (collapsed) toggleCollapsed();
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
					shellRef.current?.querySelector<HTMLElement>('input,textarea,[contenteditable=true],button:not([data-flow-switcher]),[tabindex="0"]:not([data-flow-switcher])')?.focus();
				});
	};
	return (
		<FlowRenderContext.Provider value={runtime}>
			<div
				ref={shellRef}
				className={styles.interactionShell}
				data-flow-shell={nodeId}
				data-flow-render-mode={mode}
				data-flow-collapsed={collapsed}
				style={shellStyle}
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
					<FlowDocumentNodeView data={fullData} selected={selected} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
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
				{mode === "full" && !collapsed ? RESIZE_CORNERS.map(corner => (
					<NodeResizeControl
						key={corner}
						position={corner}
						className={styles.resizeControl}
						minWidth={FLOW_NODE_MIN_WIDTH}
						minHeight={FLOW_NODE_MIN_HEIGHT}
						shouldResize={shouldResize}
						onResizeStart={startResize}
						onResizeEnd={finishResize}
					>
						<Icon name="resize-handle" data-flow-resize-corner={corner} aria-label={t(`flow.editor.resizeNode.${corner}`)} />
					</NodeResizeControl>
				)) : null}
			</div>
		</FlowRenderContext.Provider>
	);
}
export default memo(FlowNodeShell);
