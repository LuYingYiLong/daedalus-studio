import { memo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getBezierPath, Position, useStoreApi } from "@xyflow/react";
import type { FlowCanvasEdge } from "./HomeFlowSurface";
import type { FlowInteractionNode } from "./FlowNodeShell";
import type { FlowRenderRuntime } from "./flow-render-runtime";
import { flowNodeColor } from "./FlowNodes";
import { flowNodeTitle } from "./flow-node-labels";
import type { FlowHandleGeometry, FlowNodeGeometry, FlowRect } from "@/domain/flow/flow-render-stores";

type Curve = {
	source: FlowNodeGeometry;
	target: FlowNodeGeometry;
	edge: FlowCanvasEdge;
	path: Path2D;
	sx: number;
	sy: number;
	tx: number;
	ty: number;
};
type Props = {
	runtime: FlowRenderRuntime;
	edges: FlowCanvasEdge[];
	excludedEdgeId: string | null;
	onOverlayChange: (ids: readonly string[]) => void;
};

function FlowCanvasLayer({ runtime, edges, excludedEdgeId, onOverlayChange }: Props): React.JSX.Element {
	const { t } = useTranslation();
	const translateRef = useRef(t);
	translateRef.current = t;
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const xyStore = useStoreApi<FlowInteractionNode, FlowCanvasEdge>();
	const propsRef = useRef({ edges, excludedEdgeId, onOverlayChange });
	propsRef.current = { edges, excludedEdgeId, onOverlayChange };
	const invalidateRef = useRef<() => void>(() => undefined);
	useEffect(() => {
		invalidateRef.current();
	}, [edges, excludedEdgeId, t]);
	useEffect(() => {
		const canvas = canvasRef.current!;
		const host = canvas.parentElement!;
		const context = canvas.getContext("2d")!;
		let disposed = false,
			frame = 0,
			settleTimer = 0,
			upgradeFrame = 0,
			qualityTimer = 0;
		let hovered: string | null = null,
			lastTransform = "",
			moving = false,
			detail = false;
		let highQuality = true;
		const curves = new Map<string, Curve>();
		const dirtyCurves = new Set<string>();
		const titles = new Map<string, { text: string; font: string; width: number; fitted: string }>();
		const fitTitle = (id: string, text: string, width: number): string => {
			const cached = titles.get(id);
			if (cached?.text === text && cached.font === context.font && cached.width === width) return cached.fitted;
			let fitted = text;
			if (context.measureText(text).width > width) {
				const characters = Array.from(text);
				let low = 0, high = characters.length;
				while (low < high) {
					const mid = Math.ceil((low + high) / 2);
					if (context.measureText(`${characters.slice(0, mid).join("")}…`).width <= width) low = mid;
					else high = mid - 1;
				}
				fitted = width >= context.measureText("…").width ? `${characters.slice(0, low).join("")}…` : "";
			}
			titles.set(id, { text, font: context.font, width, fitted });
			return fitted;
		};
		let topology: FlowCanvasEdge[] | null = null;
		let edgeById = new Map<string, FlowCanvasEdge>();
		let geometryDirty = true,
			contentDirty = true,
			visualDirty = true;
		const padding = 256;
		const gridTile = document.createElement("canvas");
		gridTile.width = gridTile.height = 48;
		let gridColor = "";
		let gridPattern: CanvasPattern | null = null;
		let raster: { x: number; y: number; zoom: number; width: number; height: number; dpr: number } | null = null;
		let lastOverlay = "";
		const overlay = (): void => {
			const ids = new Set(runtime.selectedEdges);
			if (hovered) ids.add(hovered);
			const key = [...ids].sort().join("|");
			if (lastOverlay !== key) {
				lastOverlay = key;
				propsRef.current.onOverlayChange([...ids]);
			}
		};
		const viewRect = (padding = 0): FlowRect => {
			const state = xyStore.getState(),
				[x, y, zoom] = state.transform;
			return {
				x: (-x - padding) / zoom,
				y: (-y - padding) / zoom,
				width: (state.width + padding * 2) / zoom,
				height: (state.height + padding * 2) / zoom,
			};
		};
		const updateGeometry = (): void => {
			if (!geometryDirty) return;
			geometryDirty = false;
			const lookup = xyStore.getState().nodeLookup;
			for (const [id] of runtime.geometry.entries())
				if (!lookup.has(id)) {
					runtime.geometry.delete(id);
					runtime.canvas.removeNode(id);
					titles.delete(id);
				}
			for (const [id, node] of lookup) {
				const view = runtime.views.get(id);
				if (!view) continue;
				const old = runtime.geometry.get(id);
				if (!old) contentDirty = true;
				const width = node.measured.width ?? old?.width ?? 320;
				const height = node.measured.height ?? old?.height ?? Math.max(176, view.flowNode.height);
				const handles: FlowHandleGeometry[] = [];
				// 轮廓壳复用已测量几何，不能把缩放后的 DOM 舍入误差回写成新锚点
				if (runtime.canvas.getMode(id) === "outline" && old?.handles.length) handles.push(...old.handles);
				else
					for (const type of ["source", "target"] as const) {
						for (const handle of node.internals.handleBounds?.[type] ?? [])
							handles.push({
								id: handle.id ?? "",
								type,
								x: handle.x,
								y: handle.y,
								width: handle.width,
								height: handle.height,
								position: handle.position,
							});
					}
				if (!handles.length) {
					if (old?.handles.length) handles.push(...old.handles);
					else
						for (const [index, port] of view.flowNode.ports.entries())
							handles.push({
								id: port.id,
								type: port.direction === "input" ? "target" : "source",
								position: port.direction === "input" ? "left" : "right",
								x: port.direction === "input" ? -6 : width - 6,
								y: 56 + index * 36,
								width: 12,
								height: 12,
							});
				}
				runtime.geometry.set(id, {
					...node.internals.positionAbsolute,
					width,
					height,
					handles,
					color: flowNodeColor(view.flowNode.typeId),
					selected: node.selected === true,
				});
				if (runtime.geometry.get(id) !== old) {
					visualDirty = true;
					for (const edgeId of runtime.document.incoming.get(id) ?? []) dirtyCurves.add(edgeId);
					for (const edgeId of runtime.document.outgoing.get(id) ?? []) dirtyCurves.add(edgeId);
				}
			}
		};
		const upgrade = (): void => {
			if (disposed || moving) return;
			cancelAnimationFrame(upgradeFrame);
			const retained = runtime.geometry.nodes.query(viewRect(640));
			const pending: { id: string; mode: "full" | "outline" }[] = [];
			for (const [id, mode] of runtime.canvas.entries()) {
				if (
					mode === "full" &&
					(!detail || !retained.has(id)) &&
					!runtime.canvas.editing.has(id) &&
					!runtime.canvas.popups.has(id) &&
					!runtime.canvas.pluginEditors.has(id) &&
					!runtime.canvas.composing.has(id)
				)
					pending.push({ id, mode: "outline" });
			}
			if (detail)
				for (const id of runtime.geometry.nodes.query(viewRect(320)))
					if (runtime.canvas.getMode(id) !== "full") pending.push({ id, mode: "full" });
			const batch = (): void => {
				upgradeFrame = 0;
				if (disposed || moving) return;
				const start = performance.now();
				let count = 0;
				while (pending.length && count < 2 && performance.now() - start < 4) {
					const next = pending[0]!;
					const typeId = runtime.views.get(next.id)?.flowNode.typeId;
					// Markdown、媒体和插件表单的挂载/卸载占满本帧名额，避免两棵重 DOM 同帧提交
					const expensive =
						typeId === "builtin/output" || typeId === "builtin/media-output" || !typeId?.startsWith("builtin/");
					if (expensive && count) break;
					const { id, mode } = pending.shift()!;
					if (runtime.geometry.get(id)) runtime.canvas.set(id, mode);
					count++;
					if (expensive) break;
				}
				scheduleDraw();
				if (pending.length) upgradeFrame = requestAnimationFrame(batch);
			};
			upgradeFrame = requestAnimationFrame(batch);
		};
		const getCurve = (edge: FlowCanvasEdge): Curve | null => {
			const source = runtime.geometry.get(edge.source),
				target = runtime.geometry.get(edge.target);
			if (!source || !target) return null;
			const previous = curves.get(edge.id);
			if (previous?.source === source && previous.target === target && previous.edge === edge) return previous;
			const a = source.handles.find((handle) => handle.type === "source" && handle.id === edge.sourceHandle);
			const b = target.handles.find((handle) => handle.type === "target" && handle.id === edge.targetHandle);
			if (!a || !b) return null;
			const sx = source.x + a.x + (a.position === "right" ? a.width : a.position === "left" ? 0 : a.width / 2);
			const sy = source.y + a.y + (a.position === "bottom" ? a.height : a.position === "top" ? 0 : a.height / 2);
			const tx = target.x + b.x + (b.position === "right" ? b.width : b.position === "left" ? 0 : b.width / 2);
			const ty = target.y + b.y + (b.position === "bottom" ? b.height : b.position === "top" ? 0 : b.height / 2);
			const [path] = getBezierPath({
				sourceX: sx,
				sourceY: sy,
				sourcePosition: a.position as Position,
				targetX: tx,
				targetY: ty,
				targetPosition: b.position as Position,
			});
			// 控制点的凸包包含整条曲线，反向连接也必须纳入裁剪范围
			const numbers = path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) ?? [sx, sy, tx, ty];
			const xs = numbers.filter((_, index) => index % 2 === 0),
				ys = numbers.filter((_, index) => index % 2 === 1);
			runtime.geometry.edges.set(edge.id, {
				x: Math.min(...xs) - 12,
				y: Math.min(...ys) - 12,
				width: Math.max(...xs) - Math.min(...xs) + 24,
				height: Math.max(...ys) - Math.min(...ys) + 24,
			});
			const curve = { source, target, edge, path: new Path2D(path), sx, sy, tx, ty };
			curves.set(edge.id, curve);
			return curve;
		};
		const scheduleSettle = (): void => {
			clearTimeout(settleTimer);
			clearTimeout(qualityTimer);
			settleTimer = window.setTimeout(() => {
				moving = false;
				runtime.canvas.interaction = false;
				detail = runtime.canvas.updateDetail(xyStore.getState().transform[2]);
				upgrade();
				scheduleDraw();
			}, 150);
			qualityTimer = window.setTimeout(() => {
				highQuality = true;
				// 即使 DPR/zoom 相同，也要烘焙最终平移，避免长期缩放或亚像素平移旧位图
				visualDirty = true;
				scheduleDraw();
			}, 500);
		};
		function draw(): void {
			frame = 0;
			if (disposed) return;
			updateGeometry();
			const state = xyStore.getState(),
				[x, y, zoom] = state.transform;
			runtime.canvas.viewport = { x, y, zoom };
			const transform = `${x}:${y}:${zoom}`;
			if (lastTransform !== transform) {
				lastTransform = transform;
				moving = true;
				highQuality = false;
				runtime.canvas.interaction = true;
				cancelAnimationFrame(upgradeFrame);
				scheduleSettle();
			}
			if (contentDirty && !moving) {
				contentDirty = false;
				cancelAnimationFrame(upgradeFrame);
				upgrade();
			}
			const width = Math.max(1, state.width),
				height = Math.max(1, state.height);
			const bufferWidth = width + padding * 2,
				bufferHeight = height + padding * 2;
			const dpr = Math.min(
				highQuality ? Math.min(devicePixelRatio, 2) : 1,
				Math.sqrt((64 * 1024 * 1024) / (bufferWidth * bufferHeight * 4)),
			);
			if (topology !== propsRef.current.edges) {
				visualDirty = true;
				topology = propsRef.current.edges;
				edgeById = new Map(topology.map((edge) => [edge.id, edge]));
				for (const id of curves.keys())
					if (!edgeById.has(id)) {
						curves.delete(id);
						runtime.geometry.edges.delete(id);
						runtime.selectedEdges.delete(id);
					}
				for (const edge of topology) dirtyCurves.add(edge.id);
			}
			for (const id of dirtyCurves) {
				const edge = edgeById.get(id);
				if (edge) getCurve(edge);
			}
			dirtyCurves.clear();
			canvas.dataset.flowEdgeCount = String(
				[...curves.keys()].filter((id) => id !== propsRef.current.excludedEdgeId).length,
			);
			// 复用有限 overscan 位图，平移时只更新合成变换；超出覆盖范围才补画
			if (
				raster &&
				!visualDirty &&
				raster.width === width &&
				raster.height === height &&
				(moving || (raster.dpr === dpr && raster.zoom === zoom))
			) {
				const scale = zoom / raster.zoom;
				const dx = x - raster.x * scale + padding * (1 - scale),
					dy = y - raster.y * scale + padding * (1 - scale);
				if (
					dx <= padding &&
					dy <= padding &&
					dx + bufferWidth * scale >= width + padding &&
					dy + bufferHeight * scale >= height + padding
				) {
					canvas.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
					return;
				}
			}
			raster = { x, y, zoom, width, height, dpr };
			visualDirty = false;
			canvas.style.transform = "none";
			canvas.style.width = `${bufferWidth}px`;
			canvas.style.height = `${bufferHeight}px`;
			const pixelWidth = Math.floor(bufferWidth * dpr),
				pixelHeight = Math.floor(bufferHeight * dpr);
			if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
				canvas.width = pixelWidth;
				canvas.height = pixelHeight;
			}
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, bufferWidth, bufferHeight);
			context.translate(x + padding, y + padding);
			context.scale(zoom, zoom);
			// 网格与连线共用缓存位图，避免 SVG pattern 在每次平移时触发 React 与绘制
			const canvasStyle = getComputedStyle(canvas);
			const nextGridColor = canvasStyle.getPropertyValue("--ant-color-text-quaternary").trim() || "#b1b1b7";
			if (nextGridColor !== gridColor) {
				gridColor = nextGridColor;
				const tileContext = gridTile.getContext("2d")!;
				tileContext.clearRect(0, 0, 48, 48);
				tileContext.fillStyle = gridColor;
				tileContext.beginPath();
				tileContext.arc(24, 24, 1, 0, Math.PI * 2);
				tileContext.fill();
				gridPattern = context.createPattern(gridTile, "repeat");
				gridPattern?.setTransform(new DOMMatrix().scale(0.5));
			}
			if (gridPattern) {
				const region = viewRect(padding);
				context.fillStyle = gridPattern;
				context.fillRect(region.x, region.y, region.width, region.height);
			}
			for (const id of runtime.geometry.edges.query(viewRect(padding))) {
				// 悬浮和选择只启用 SVG 命中层，不交接绘制，避免异步切层导致空帧或线条变色
				if (id === propsRef.current.excludedEdgeId) continue;
				const curve = curves.get(id);
				if (!curve) continue;
				const gradient = context.createLinearGradient(
					curve.sx,
					curve.sy,
					curve.tx === curve.sx && curve.ty === curve.sy ? curve.tx + 0.01 : curve.tx,
					curve.ty,
				);
				gradient.addColorStop(0, curve.edge.data?.sourceColor ?? "#888");
				gradient.addColorStop(1, curve.edge.data?.targetColor ?? "#888");
				context.strokeStyle = gradient;
				context.lineWidth = 2;
				context.stroke(curve.path);
			}
			const background = canvasStyle.getPropertyValue("--ant-color-bg-container").trim() || "#fff";
			const radius = parseFloat(canvasStyle.getPropertyValue("--ds-radius-lg")) || 8;
			const headerPadding = parseFloat(canvasStyle.getPropertyValue("--ds-space-2")) || 8;
			const titlePadding = parseFloat(canvasStyle.getPropertyValue("--ds-space-3")) || 12;
			const fontSize = parseFloat(canvasStyle.fontSize) || 14;
			const headerHeight = (parseFloat(canvasStyle.lineHeight) || fontSize * 1.5715) + headerPadding * 2;
			context.font = `${canvasStyle.fontWeight} ${fontSize}px ${canvasStyle.fontFamily}`;
			context.textAlign = "left";
			context.textBaseline = "middle";
			for (const id of runtime.geometry.nodes.query(viewRect(padding))) {
				if (runtime.canvas.getMode(id) === "full") continue;
				const node = runtime.geometry.get(id)!;
				const view = runtime.views.get(id);
				const height = Math.min(headerHeight, node.height);
				const corner = Math.min(radius, node.width / 2, height / 2);
				context.beginPath();
				context.roundRect(node.x, node.y, node.width, node.height, corner);
				context.fillStyle = background;
				context.fill();
				context.beginPath();
				context.roundRect(node.x, node.y, node.width, height, [corner, corner, 0, 0]);
				context.fillStyle = node.color;
				context.fill();
				if (view) {
					context.fillStyle = "#fff";
					context.fillText(
						fitTitle(id, flowNodeTitle(translateRef.current, view.flowNode, view.definition), Math.max(0, node.width - titlePadding * 2)),
						node.x + titlePadding,
						node.y + height / 2,
					);
				}
				context.beginPath();
				context.roundRect(node.x, node.y, node.width, node.height, corner);
				context.strokeStyle = node.selected ? "#4096ff" : node.color;
				context.lineWidth = node.selected ? 2.5 : 1.5;
				context.stroke();
			}
		}
		function scheduleDraw(): void {
			if (!disposed && !frame) frame = requestAnimationFrame(draw);
		}
		invalidateRef.current = () => {
			visualDirty = true;
			scheduleDraw();
		};
		const hit = (event: PointerEvent): string | null => {
			const element = event.target as Element;
			if (!element.closest(".react-flow__pane") || element.closest(".react-flow__node")) return null;
			const bounds = host.getBoundingClientRect(),
				[x, y, zoom] = xyStore.getState().transform;
			const px = (event.clientX - bounds.left - x) / zoom,
				py = (event.clientY - bounds.top - y) / zoom;
			context.save();
			context.setTransform(1, 0, 0, 1, 0, 0);
			context.lineWidth = 16 / zoom;
			let match: string | null = null;
			for (const id of runtime.geometry.edges.query({
				x: px - 8 / zoom,
				y: py - 8 / zoom,
				width: 16 / zoom,
				height: 16 / zoom,
			})) {
				const curve = curves.get(id);
				if (curve && context.isPointInStroke(curve.path, px, py)) {
					match = id;
					break;
				}
			}
			context.restore();
			return match;
		};
		const pointerMove = (event: PointerEvent): void => {
			if (event.buttons || moving) return;
			const svg = (event.target as Element).closest(".react-flow__edge");
			const next = svg?.getAttribute("data-id") ?? hit(event);
			if (next !== hovered) {
				hovered = next;
				overlay();
			}
		};
		const pointerDown = (event: PointerEvent): void => {
			cancelAnimationFrame(upgradeFrame);
			clearTimeout(settleTimer);
			clearTimeout(qualityTimer);
			highQuality = false;
			moving = true;
			runtime.canvas.interaction = true;
			if (event.button !== 0) return;
			visualDirty = true;
			const id = (event.target as Element).closest(".react-flow__edge")?.getAttribute("data-id") ?? hit(event);
			if (id) {
				if (!(event.ctrlKey || event.metaKey || event.shiftKey)) runtime.selectedEdges.clear();
				runtime.selectedEdges.add(id);
				hovered = id;
				overlay();
				scheduleDraw();
				if (!(event.target as Element).closest(".react-flow__edge")) event.stopPropagation();
			} else if ((event.target as Element).closest(".react-flow__pane")) {
				runtime.selectedEdges.clear();
				hovered = null;
				overlay();
				scheduleDraw();
			}
		};
		const pointerUp = (): void => scheduleSettle();
		const wheel = (): void => {
			highQuality = false;
			cancelAnimationFrame(upgradeFrame);
			moving = true;
			runtime.canvas.interaction = true;
			pointerUp();
		};
		const unsubscribe = xyStore.subscribe((state, previous) => {
			// 平移只改变 transform，不重新遍历节点和连线几何
			if (state.transform === previous.transform) geometryDirty = true;
			scheduleDraw();
		});
		const unsubscribeViews = runtime.views.subscribeAll(() => {
			geometryDirty = true;
			visualDirty = true;
			scheduleDraw();
		});
		const unsubscribeModes = runtime.canvas.subscribeAll(() => {
			visualDirty = true;
			scheduleDraw();
		});
		const themeObserver = new MutationObserver(() => {
			visualDirty = true;
			scheduleDraw();
		});
		const fontsLoaded = (): void => {
			titles.clear();
			visualDirty = true;
			scheduleDraw();
		};
		document.fonts.addEventListener("loadingdone", fontsLoaded);
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme", "data-theme-variant", "style"],
		});
		host.addEventListener("pointermove", pointerMove, true);
		host.addEventListener("pointerdown", pointerDown, true);
		host.addEventListener("wheel", wheel, { passive: true });
		window.addEventListener("pointerup", pointerUp);
		window.addEventListener("pointercancel", pointerUp);
		window.addEventListener("blur", pointerUp);
		window.addEventListener("resize", scheduleSettle);
		scheduleDraw();
		return () => {
			disposed = true;
			cancelAnimationFrame(frame);
			cancelAnimationFrame(upgradeFrame);
			clearTimeout(settleTimer);
			clearTimeout(qualityTimer);
			unsubscribe();
			unsubscribeViews();
			unsubscribeModes();
			themeObserver.disconnect();
			document.fonts.removeEventListener("loadingdone", fontsLoaded);
			invalidateRef.current = () => undefined;
			host.removeEventListener("pointermove", pointerMove, true);
			host.removeEventListener("pointerdown", pointerDown, true);
			host.removeEventListener("wheel", wheel);
			window.removeEventListener("pointerup", pointerUp);
			window.removeEventListener("pointercancel", pointerUp);
			window.removeEventListener("blur", pointerUp);
			window.removeEventListener("resize", scheduleSettle);
			curves.clear();
			titles.clear();
			runtime.geometry.edges.clear();
		};
	}, [runtime, xyStore]);
	return (
		<canvas
			ref={canvasRef}
			data-flow-canvas-layer="true"
			aria-hidden
			style={{
				position: "absolute",
				left: -256,
				top: -256,
				transformOrigin: "0 0",
				willChange: "transform",
				pointerEvents: "none",
				zIndex: 0,
			}}
		/>
	);
}
export default memo(FlowCanvasLayer);
