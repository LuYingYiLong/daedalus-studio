import { Anchor, Tooltip } from "antd";
import type { AnchorProps } from "antd";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SessionTimelineNavigationEntry } from "@/platform/rpc/types";
import styles from "./ConversationAnchorNavigator.module.css";

export type ConversationAnchorNavigatorProps = {
	entries: SessionTimelineNavigationEntry[];
	activeEntryId: string | null;
	onNavigate: (entry: SessionTimelineNavigationEntry) => void;
};

function entryHref(entry: SessionTimelineNavigationEntry): string {
	return `#conversation-turn-${encodeURIComponent(entry.entryId)}`;
}

function getWaveClass(distance: number): string {
	if (distance === 0) {
		return styles.tickHovered;
	}
	if (distance === 1) {
		return styles.tickNeighborOne;
	}
	if (distance === 2) {
		return styles.tickNeighborTwo;
	}
	if (distance === 3) {
		return styles.tickNeighborThree;
	}
	return "";
}

export default function ConversationAnchorNavigator({
	entries,
	activeEntryId,
	onNavigate
}: ConversationAnchorNavigatorProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
	const [isDragging, setIsDragging] = useState<boolean>(false);
	const navigatorRef = useRef<HTMLElement | null>(null);
	const draggingPointerIdRef = useRef<number | null>(null);
	const draggedIndexRef = useRef<number | null>(null);
	const suppressNextClickRef = useRef<boolean>(false);
	const entriesByHref: ReadonlyMap<string, SessionTimelineNavigationEntry> = useMemo((): ReadonlyMap<string, SessionTimelineNavigationEntry> => {
		return new Map(entries.map((entry: SessionTimelineNavigationEntry): [string, SessionTimelineNavigationEntry] => [entryHref(entry), entry]));
	}, [entries]);
	const activeEntry: SessionTimelineNavigationEntry | undefined = entries.find((entry: SessionTimelineNavigationEntry): boolean => entry.entryId === activeEntryId);
	const activeHref: string = activeEntry === undefined ? "" : entryHref(activeEntry);

	function getIndexAtClientY(clientY: number): number | null {
		const navigator: HTMLElement | null = navigatorRef.current;
		if (navigator === null) {
			return null;
		}
		const ticks: HTMLElement[] = Array.from(
			navigator.querySelectorAll<HTMLElement>(
				"[data-conversation-anchor-index]",
			),
		);
		if (ticks.length === 0) {
			return null;
		}
		let nearestIndex: number | null = null;
		let nearestDistance: number = Number.POSITIVE_INFINITY;
		for (const tick of ticks) {
			const index: number = Number(tick.dataset.conversationAnchorIndex);
			if (!Number.isInteger(index)) {
				continue;
			}
			const bounds: DOMRect = tick.getBoundingClientRect();
			const distance: number = Math.abs(clientY - (bounds.top + bounds.height / 2));
			if (distance < nearestDistance) {
				nearestIndex = index;
				nearestDistance = distance;
			}
		}
		return nearestIndex;
	}

	function navigateToDragIndex(index: number): void {
		const entry: SessionTimelineNavigationEntry | undefined = entries[index];
		if (entry === undefined) {
			return;
		}
		setHoveredIndex(index);
		if (draggedIndexRef.current === index) {
			return;
		}
		draggedIndexRef.current = index;
		onNavigate(entry);
	}

	function finishDrag(): void {
		draggingPointerIdRef.current = null;
		draggedIndexRef.current = null;
		setIsDragging(false);
	}

	useLayoutEffect((): (() => void) | undefined => {
		const navigator: HTMLElement | null = navigatorRef.current;
		if (navigator === null || activeEntryId === null) {
			return undefined;
		}
		const frameId: number = window.requestAnimationFrame((): void => {
			const activeTick: HTMLElement | null = navigator.querySelector<HTMLElement>("[data-conversation-anchor-active='true']");
			if (activeTick === null) {
				return;
			}
			const navigatorBounds: DOMRect = navigator.getBoundingClientRect();
			const tickBounds: DOMRect = activeTick.getBoundingClientRect();
			const edgePadding: number = 4;
			if (tickBounds.top < navigatorBounds.top + edgePadding) {
				navigator.scrollTop -= navigatorBounds.top + edgePadding - tickBounds.top;
			} else if (tickBounds.bottom > navigatorBounds.bottom - edgePadding) {
				navigator.scrollTop += tickBounds.bottom - navigatorBounds.bottom + edgePadding;
			}
		});
		return (): void => window.cancelAnimationFrame(frameId);
	}, [activeEntryId, entries.length]);

	const items: AnchorProps["items"] = entries.map((entry: SessionTimelineNavigationEntry, index: number) => {
		const isActive: boolean = entry.entryId === activeEntryId;
		const distance: number = hoveredIndex === null ? -1 : Math.abs(index - hoveredIndex);
		const tooltipText: string = entry.preview.length > 0 ? entry.preview : t("agentPage.conversationNavigator.emptyMessage");
		return {
			key: entry.entryId,
			href: entryHref(entry),
			title: (
				<Tooltip title={<span className={styles.tooltipText}>{tooltipText}</span>} placement="right">
					<span
						aria-label={tooltipText}
						aria-current={isActive ? "true" : undefined}
						data-conversation-anchor-active={isActive ? "true" : undefined}
						data-conversation-anchor-index={index}
						className={[
							styles.tick,
							isActive ? styles.tickActive : "",
							getWaveClass(distance)
						].filter(Boolean).join(" ")}
						onBlur={(): void => setHoveredIndex(null)}
						onFocus={(): void => setHoveredIndex(index)}
						onMouseEnter={(): void => setHoveredIndex(index)}
						onMouseLeave={(): void => setHoveredIndex(null)}
						onPointerDown={(event: React.PointerEvent<HTMLElement>): void => {
							if (event.button !== 0) {
								return;
							}
							event.preventDefault();
							event.currentTarget.setPointerCapture(event.pointerId);
							draggingPointerIdRef.current = event.pointerId;
							draggedIndexRef.current = null;
							suppressNextClickRef.current = false;
							setIsDragging(true);
							navigateToDragIndex(index);
						}}
						onPointerMove={(event: React.PointerEvent<HTMLElement>): void => {
							if (draggingPointerIdRef.current !== event.pointerId) {
								return;
							}
							event.preventDefault();
							const nextIndex: number | null = getIndexAtClientY(event.clientY);
							if (nextIndex !== null) {
								if (draggedIndexRef.current !== nextIndex) {
									suppressNextClickRef.current = true;
								}
								navigateToDragIndex(nextIndex);
							}
						}}
						onPointerUp={(event: React.PointerEvent<HTMLElement>): void => {
							if (draggingPointerIdRef.current !== event.pointerId) {
								return;
							}
							finishDrag();
						}}
						onPointerCancel={(event: React.PointerEvent<HTMLElement>): void => {
							if (draggingPointerIdRef.current !== event.pointerId) {
								return;
							}
							suppressNextClickRef.current = false;
							finishDrag();
						}}
						onLostPointerCapture={(): void => {
							if (draggingPointerIdRef.current !== null) {
								suppressNextClickRef.current = false;
								finishDrag();
							}
						}}
					/>
				</Tooltip>
			)
		};
	});

	if (entries.length === 0) {
		return null;
	}

	return (
		<nav
			ref={navigatorRef}
			className={styles.navigator}
			data-conversation-anchor-dragging={isDragging ? "true" : undefined}
			aria-label={t("agentPage.conversationNavigator.ariaLabel")}
		>
			<Anchor
				affix={false}
				classNames={{
					root: styles.anchorRoot,
					item: styles.anchorItem,
					itemTitle: styles.anchorItemTitle,
					indicator: styles.anchorIndicator
				}}
				getCurrentAnchor={(): string => activeHref}
				items={items}
				onClick={(event: React.MouseEvent<HTMLElement>, link: { href: string }): void => {
					event.preventDefault();
					if (suppressNextClickRef.current) {
						suppressNextClickRef.current = false;
						return;
					}
					const entry: SessionTimelineNavigationEntry | undefined = entriesByHref.get(link.href);
					if (entry !== undefined) {
						onNavigate(entry);
					}
				}}
			/>
		</nav>
	);
}
