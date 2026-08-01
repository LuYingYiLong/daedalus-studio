import type { AdditionalContextItem, MessageTextAnchor, SelectionAskThread } from "@/api/types";
import { Icon } from "@/assets/icons";
import { Button, Input, Space, Tooltip } from "antd";
import type { InputRef } from "antd";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createMessageTextAnchor, getMessageAnchorKey, getMessageSelectionContextId, resolveMessageTextAnchor } from "./message-text-anchor";
import styles from "./MessageSelectionOverlay.module.css";

type PositionedAnchor = { anchor: MessageTextAnchor; left: number; top: number };
type ActiveSelection = PositionedAnchor & { range: Range };
type PositionedContextMarker = PositionedAnchor & { item: AdditionalContextItem };
type PositionedAskMarker = PositionedAnchor & { thread: SelectionAskThread };
type PositionedMarkers = { contexts: PositionedContextMarker[]; asks: PositionedAskMarker[] };

export type MessageSelectionOverlayProps = {
	container: HTMLElement | null;
	scroller: HTMLElement | null;
	contextItems: AdditionalContextItem[];
	askThreads: SelectionAskThread[];
	onAddContext: (item: AdditionalContextItem) => void;
	onAsk: (anchor: MessageTextAnchor) => Promise<void>;
	onOpenAsk: (threadId: string) => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getContextAnchor(item: AdditionalContextItem): MessageTextAnchor | null {
	if (item.kind !== "message_selection" || !isRecord(item.data) || !isRecord(item.data.anchor)) {
		return null;
	}
	return item.data.anchor as MessageTextAnchor;
}

function getContextAnnotation(item: AdditionalContextItem): string {
	return isRecord(item.data) && typeof item.data.annotation === "string" ? item.data.annotation : "";
}

function getPosition(range: Range, container: HTMLElement, horizontal: "center" | "end" = "center"): { left: number; top: number } | null {
	const rect: DOMRect = range.getBoundingClientRect();
	const parentRect: DOMRect = container.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0 || rect.bottom < parentRect.top || rect.top > parentRect.bottom) {
		return null;
	}
	return {
		left: Math.min(parentRect.width - 12, Math.max(12, horizontal === "end"
			? rect.right - parentRect.left
			: rect.left - parentRect.left + rect.width / 2)),
		top: Math.max(8, rect.top - parentRect.top - 8)
	};
}

function clearBrowserSelection(): void {
	window.getSelection()?.removeAllRanges();
}

function applyAnchoredPosition(element: HTMLElement | null | undefined, position: { left: number; top: number } | null): void {
	if (element === null || element === undefined) return;
	if (position === null) {
		element.style.visibility = "hidden";
		return;
	}
	element.style.removeProperty("visibility");
	element.style.left = `${position.left}px`;
	element.style.top = `${position.top}px`;
}

function haveSameMarkerMembers(current: PositionedMarkers, next: PositionedMarkers): boolean {
	return current.contexts.length === next.contexts.length
		&& current.asks.length === next.asks.length
		&& current.contexts.every((marker: PositionedContextMarker, index: number): boolean => {
			const nextMarker: PositionedContextMarker | undefined = next.contexts[index];
			return nextMarker !== undefined && marker.item === nextMarker.item;
		})
		&& current.asks.every((marker: PositionedAskMarker, index: number): boolean => {
			const nextMarker: PositionedAskMarker | undefined = next.asks[index];
			return nextMarker !== undefined && marker.thread.threadId === nextMarker.thread.threadId;
		});
}

function createContextItem(anchor: MessageTextAnchor, annotation: string, existingId?: string): AdditionalContextItem {
	return {
		id: existingId ?? getMessageSelectionContextId(anchor),
		kind: "message_selection",
		title: anchor.quote.length > 48 ? `${anchor.quote.slice(0, 48)}…` : anchor.quote,
		subtitle: annotation,
		source: "manual",
		data: { anchor, selectedText: anchor.quote, annotation }
	};
}

function MessageSelectionOverlay({ container, scroller, contextItems, askThreads, onAddContext, onAsk, onOpenAsk }: MessageSelectionOverlayProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const inputRef = useRef<InputRef | null>(null);
	const cancelEditRef = useRef<boolean>(false);
	const committingEditRef = useRef<boolean>(false);
	const contextMarkerElementsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
	const askMarkerElementsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
	const [activeSelection, setActiveSelection] = useState<ActiveSelection | null>(null);
	const [editing, setEditing] = useState<{ anchor: MessageTextAnchor; itemId?: string; left: number; top: number } | null>(null);
	const [annotation, setAnnotation] = useState<string>("");
	const [markers, setMarkers] = useState<PositionedMarkers>({ contexts: [], asks: [] });

	const contextAnchors = useMemo(() => contextItems.flatMap((item: AdditionalContextItem) => {
		const anchor: MessageTextAnchor | null = getContextAnchor(item);
		return anchor === null ? [] : [{ item, anchor }];
	}), [contextItems]);

	const updateMarkers = useCallback((): void => {
		if (container === null) {
			setMarkers((current: PositionedMarkers): PositionedMarkers => current.contexts.length === 0 && current.asks.length === 0
				? current
				: { contexts: [], asks: [] });
			return;
		}
		const contexts: PositionedContextMarker[] = contextAnchors.flatMap(({ item, anchor }) => {
			const range: Range | null = resolveMessageTextAnchor(anchor, container);
			const position = range === null ? null : getPosition(range, container, "end");
			return position === null ? [] : [{ item, anchor, ...position }];
		});
		const asks: PositionedAskMarker[] = askThreads.flatMap((thread: SelectionAskThread) => {
			const range: Range | null = resolveMessageTextAnchor(thread.anchor, container);
			const position = range === null ? null : getPosition(range, container, "end");
			return position === null ? [] : [{ thread, anchor: thread.anchor, ...position }];
		});
		for (const marker of contexts) {
			applyAnchoredPosition(contextMarkerElementsRef.current.get(marker.item.id), marker);
		}
		for (const marker of asks) {
			applyAnchoredPosition(askMarkerElementsRef.current.get(marker.thread.threadId), marker);
		}
		const next: PositionedMarkers = { contexts, asks };
		setMarkers((current: PositionedMarkers): PositionedMarkers => haveSameMarkerMembers(current, next) ? current : next);
	}, [askThreads, container, contextAnchors]);

	const updateActiveControls = useCallback((): void => {
		if (container === null) return;
		if (activeSelection !== null) {
			const position = getPosition(activeSelection.range, container);
			applyAnchoredPosition(
				container.querySelector<HTMLElement>("[data-message-selection-actions='true']"),
				position
			);
		}
		if (editing !== null) {
			const range: Range | null = resolveMessageTextAnchor(editing.anchor, container);
			const position = range === null ? null : getPosition(range, container);
			applyAnchoredPosition(inputRef.current?.input, position);
		}
	}, [activeSelection, container, editing]);

	const updateOverlayPositions = useCallback((): void => {
		updateMarkers();
		updateActiveControls();
	}, [updateActiveControls, updateMarkers]);

	useEffect((): (() => void) | void => {
		if (container === null) {
			return;
		}
		let selectionFrame: number | null = null;
		let pointerSelecting = false;
		const readFinalSelection = (): void => {
			const selection: Selection | null = window.getSelection();
			if (selection === null) {
				if (editing === null) setActiveSelection(null);
				return;
			}
			const result = createMessageTextAnchor(selection);
			if (result === null || !container.contains(result.segment)) {
				if (editing === null) setActiveSelection(null);
				return;
			}
			const position = getPosition(result.range, container);
			if (position !== null) setActiveSelection({ anchor: result.anchor, range: result.range, ...position });
		};
		const scheduleSelectionRead = (): void => {
			if (selectionFrame !== null) window.cancelAnimationFrame(selectionFrame);
			selectionFrame = window.requestAnimationFrame((): void => {
				selectionFrame = null;
				readFinalSelection();
			});
		};
		const isSelectionControl = (target: EventTarget | null): boolean => (
			target instanceof Element && target.closest("[data-message-selection-control='true']") !== null
		);
		const handlePointerDown = (event: PointerEvent): void => {
			if (isSelectionControl(event.target)) return;
			pointerSelecting = true;
			if (editing === null) setActiveSelection(null);
		};
		const handlePointerUp = (): void => {
			if (!pointerSelecting) return;
			pointerSelecting = false;
			scheduleSelectionRead();
		};
		const handlePointerCancel = (): void => {
			if (!pointerSelecting) return;
			pointerSelecting = false;
			if (editing === null) setActiveSelection(null);
		};
		const handleKeyDown = (event: KeyboardEvent): void => {
			if (!isSelectionControl(event.target) && editing === null) setActiveSelection(null);
		};
		const handleKeyUp = (event: KeyboardEvent): void => {
			if (!isSelectionControl(event.target)) scheduleSelectionRead();
		};
		const handleSelectionChange = (): void => {
			const selection: Selection | null = window.getSelection();
			if ((selection === null || selection.isCollapsed) && editing === null) setActiveSelection(null);
		};
		container.addEventListener("pointerdown", handlePointerDown, true);
		container.addEventListener("keydown", handleKeyDown, true);
		container.addEventListener("keyup", handleKeyUp, true);
		window.addEventListener("pointerup", handlePointerUp, true);
		window.addEventListener("pointercancel", handlePointerCancel, true);
		document.addEventListener("selectionchange", handleSelectionChange);
		scroller?.addEventListener("scroll", updateOverlayPositions, { passive: true });
		window.addEventListener("resize", updateOverlayPositions);
		const observer = new ResizeObserver(updateOverlayPositions);
		observer.observe(container);
		if (scroller !== null) observer.observe(scroller);
		const observeSegments = (): void => {
			container.querySelectorAll<HTMLElement>("[data-message-selection-segment]").forEach((segment: HTMLElement): void => observer.observe(segment));
		};
		observeSegments();
		const mutationObserver = new MutationObserver((): void => {
			observeSegments();
			updateOverlayPositions();
		});
		mutationObserver.observe(container, { childList: true, subtree: true });
		updateOverlayPositions();
		return (): void => {
			container.removeEventListener("pointerdown", handlePointerDown, true);
			container.removeEventListener("keydown", handleKeyDown, true);
			container.removeEventListener("keyup", handleKeyUp, true);
			window.removeEventListener("pointerup", handlePointerUp, true);
			window.removeEventListener("pointercancel", handlePointerCancel, true);
			document.removeEventListener("selectionchange", handleSelectionChange);
			scroller?.removeEventListener("scroll", updateOverlayPositions);
			window.removeEventListener("resize", updateOverlayPositions);
			observer.disconnect();
			mutationObserver.disconnect();
			if (selectionFrame !== null) window.cancelAnimationFrame(selectionFrame);
		};
	}, [container, editing, scroller, updateOverlayPositions]);

	useLayoutEffect((): void => updateOverlayPositions(), [updateOverlayPositions]);
	useEffect((): void => {
		if (editing !== null) window.requestAnimationFrame((): void => inputRef.current?.focus());
	}, [editing]);

	const startAnnotation = useCallback((anchor: MessageTextAnchor, left: number, top: number, item?: AdditionalContextItem): void => {
		cancelEditRef.current = false;
		committingEditRef.current = false;
		setAnnotation(item === undefined ? "" : getContextAnnotation(item));
		setEditing({ anchor, itemId: item?.id, left, top });
		setActiveSelection(null);
	}, []);

	const commitAnnotation = useCallback((): void => {
		if (committingEditRef.current) return;
		if (cancelEditRef.current) {
			cancelEditRef.current = false;
			return;
		}
		if (editing === null) return;
		committingEditRef.current = true;
		onAddContext(createContextItem(editing.anchor, annotation.slice(0, 1200), editing.itemId));
		setEditing(null);
		setActiveSelection(null);
		clearBrowserSelection();
	}, [annotation, editing, onAddContext]);

	return (
		<div className={styles.overlay} aria-hidden={false}>
			{activeSelection !== null && editing === null ? (
				<Space.Compact
					data-message-selection-control="true"
					data-message-selection-actions="true"
					className={styles.selectionActions}
					style={{
						left: activeSelection.left,
						top: activeSelection.top
					}}
				>
					<Button
						type="text"
						icon={<Icon name="chat" />}
						onMouseDown={(event) => event.preventDefault()}
						onClick={(): void => startAnnotation(activeSelection.anchor, activeSelection.left, activeSelection.top)}
					>
						{t("chat.selection.attachContext")}
					</Button>
					<Button
						type="text"
						icon={<Icon name="ask" />}
						onMouseDown={(event) => event.preventDefault()}
						onClick={(): void => {
							setActiveSelection(null);
							clearBrowserSelection();
							void onAsk(activeSelection.anchor);
					}}>
						{t("chat.selection.askAi")}
					</Button>
				</Space.Compact>
			) : null}
			{editing !== null ? (
				<Input
					ref={inputRef}
					data-message-selection-control="true"
					className={styles.annotationInput}
					style={{ left: editing.left, top: editing.top }}
					value={annotation}
					maxLength={1200}
					placeholder={t("chat.selection.annotationPlaceholder")}
					onChange={(event): void => setAnnotation(event.target.value)}
					onBlur={commitAnnotation}
					onPressEnter={(event): void => {
						if (!event.nativeEvent.isComposing) commitAnnotation();
					}}
					onKeyDown={(event): void => {
						if (event.key === "Escape") {
							event.preventDefault();
							cancelEditRef.current = true;
							setEditing(null);
							clearBrowserSelection();
						}
					}}
				/>
			) : null}
			{markers.contexts.map(({ item, anchor, left, top }) => (
				<Tooltip key={item.id} title={t("chat.selection.editAnnotation")}>
					<Button
						ref={(element: HTMLButtonElement | null): void => {
							if (element === null) contextMarkerElementsRef.current.delete(item.id);
							else contextMarkerElementsRef.current.set(item.id, element);
						}}
						data-message-selection-control="true"
						className={styles.marker}
						style={{ left, top }}
						type="text"
						shape="circle"
						size="small"
						icon={<Icon name="chat" />}
						onClick={(): void => startAnnotation(anchor, left, top, item)}
					/>
				</Tooltip>
			))}
			{markers.asks.map(({ thread, left, top }) => (
				<Tooltip key={thread.threadId} title={t("chat.selection.openAsk")}>
					<Button
						ref={(element: HTMLButtonElement | null): void => {
							if (element === null) askMarkerElementsRef.current.delete(thread.threadId);
							else askMarkerElementsRef.current.set(thread.threadId, element);
						}}
						data-message-selection-control="true"
						className={`${styles.marker} ${styles.askMarker}`}
						style={{ left, top }}
						type="text"
						shape="circle"
						size="small"
						icon={<Icon name="ask" />}
						onClick={(): void => { void onOpenAsk(thread.threadId); }}
					/>
				</Tooltip>
			))}
		</div>
	);
}

export default memo(MessageSelectionOverlay);
