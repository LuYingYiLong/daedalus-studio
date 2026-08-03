import { Anchor, Tooltip } from "antd";
import type { AnchorProps } from "antd";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SessionTimelineNavigationEntry } from "@/api/types";
import { resolveActiveBlockOffset, resolveActiveTimelineEntryId, type ConversationViewportRow } from "./conversation-navigation";
import styles from "./ConversationAnchorNavigator.module.css";

export type ConversationAnchorNavigatorProps = {
	entries: SessionTimelineNavigationEntry[];
	activeEntryId: string | null;
	scrollContainer: HTMLElement | null;
	onNavigate: (entry: SessionTimelineNavigationEntry) => void;
	onActiveEntryChange?: (entry: SessionTimelineNavigationEntry) => void;
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

function resolveViewportActiveEntryId(
	entries: readonly SessionTimelineNavigationEntry[],
	scrollContainer: HTMLElement
): string | null {
	const containerBounds: DOMRect = scrollContainer.getBoundingClientRect();
	const rows: ConversationViewportRow[] = Array.from(
		scrollContainer.querySelectorAll<HTMLElement>("[data-timeline-block-offset]")
	).map((row: HTMLElement): ConversationViewportRow | null => {
		const blockOffset: number = Number(row.dataset.timelineBlockOffset);
		if (!Number.isSafeInteger(blockOffset)) {
			return null;
		}
		const bounds: DOMRect = row.getBoundingClientRect();
		return { blockOffset, top: bounds.top, bottom: bounds.bottom };
	}).filter((row: ConversationViewportRow | null): row is ConversationViewportRow => row !== null);
	const atBottom: boolean = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight <= 16;
	const activeBlockOffset: number | null = resolveActiveBlockOffset(
		rows,
		containerBounds.top + Math.min(56, scrollContainer.clientHeight * 0.2),
		atBottom,
		containerBounds.top,
		containerBounds.bottom
	);
	return resolveActiveTimelineEntryId(entries, activeBlockOffset);
}

export default function ConversationAnchorNavigator({
	entries,
	activeEntryId,
	scrollContainer,
	onNavigate,
	onActiveEntryChange
}: ConversationAnchorNavigatorProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
	const [viewportActiveEntryId, setViewportActiveEntryId] = useState<string | null>(null);
	const navigatorRef = useRef<HTMLElement | null>(null);
	const viewportFrameRef = useRef<number | null>(null);
	const entriesByHref: ReadonlyMap<string, SessionTimelineNavigationEntry> = useMemo((): ReadonlyMap<string, SessionTimelineNavigationEntry> => {
		return new Map(entries.map((entry: SessionTimelineNavigationEntry): [string, SessionTimelineNavigationEntry] => [entryHref(entry), entry]));
	}, [entries]);
	const effectiveActiveEntryId: string | null = viewportActiveEntryId !== null
		&& entries.some((entry: SessionTimelineNavigationEntry): boolean => entry.entryId === viewportActiveEntryId)
		? viewportActiveEntryId
		: activeEntryId;
	const activeEntry: SessionTimelineNavigationEntry | undefined = entries.find((entry: SessionTimelineNavigationEntry): boolean => entry.entryId === effectiveActiveEntryId);
	const activeHref: string = activeEntry === undefined ? "" : entryHref(activeEntry);

	useEffect((): (() => void) | undefined => {
		if (scrollContainer === null) {
			setViewportActiveEntryId(null);
			return undefined;
		}

		const syncActiveEntry = (): void => {
			viewportFrameRef.current = null;
			const nextActiveEntryId: string | null = resolveViewportActiveEntryId(entries, scrollContainer);
			setViewportActiveEntryId((currentEntryId: string | null): string | null => (
				currentEntryId === nextActiveEntryId ? currentEntryId : nextActiveEntryId
			));
			const nextActiveEntry: SessionTimelineNavigationEntry | undefined = entries.find(
				(entry: SessionTimelineNavigationEntry): boolean => entry.entryId === nextActiveEntryId
			);
			if (nextActiveEntry !== undefined) {
				onActiveEntryChange?.(nextActiveEntry);
			}
		};
		const scheduleActiveEntrySync = (): void => {
			if (viewportFrameRef.current !== null) {
				return;
			}
			viewportFrameRef.current = window.requestAnimationFrame(syncActiveEntry);
		};

		scrollContainer.addEventListener("scroll", scheduleActiveEntrySync, { passive: true });
		const resizeObserver = new ResizeObserver(scheduleActiveEntrySync);
		resizeObserver.observe(scrollContainer);
		const observeMountedRows = (): void => {
			for (const row of scrollContainer.querySelectorAll<HTMLElement>("[data-timeline-block-offset]")) {
				resizeObserver.observe(row);
			}
		};
		observeMountedRows();
		const mutationObserver = new MutationObserver((): void => {
			observeMountedRows();
			scheduleActiveEntrySync();
		});
		mutationObserver.observe(scrollContainer, { childList: true, subtree: true });
		scheduleActiveEntrySync();

		return (): void => {
			scrollContainer.removeEventListener("scroll", scheduleActiveEntrySync);
			resizeObserver.disconnect();
			mutationObserver.disconnect();
			if (viewportFrameRef.current !== null) {
				window.cancelAnimationFrame(viewportFrameRef.current);
				viewportFrameRef.current = null;
			}
		};
	}, [entries, onActiveEntryChange, scrollContainer]);

	useLayoutEffect((): (() => void) | undefined => {
		const navigator: HTMLElement | null = navigatorRef.current;
		if (navigator === null || effectiveActiveEntryId === null) {
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
	}, [effectiveActiveEntryId, entries.length]);

	const items: AnchorProps["items"] = entries.map((entry: SessionTimelineNavigationEntry, index: number) => {
		const isActive: boolean = entry.entryId === effectiveActiveEntryId;
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
						className={[
							styles.tick,
							isActive ? styles.tickActive : "",
							getWaveClass(distance)
						].filter(Boolean).join(" ")}
						onBlur={(): void => setHoveredIndex(null)}
						onFocus={(): void => setHoveredIndex(index)}
						onMouseEnter={(): void => setHoveredIndex(index)}
						onMouseLeave={(): void => setHoveredIndex(null)}
					/>
				</Tooltip>
			)
		};
	});

	if (entries.length === 0) {
		return null;
	}

	return (
		<nav ref={navigatorRef} className={styles.navigator} aria-label={t("agentPage.conversationNavigator.ariaLabel")}>
			<Anchor
				affix={false}
				classNames={{
					root: styles.anchorRoot,
					item: styles.anchorItem,
					itemTitle: styles.anchorItemTitle,
					indicator: styles.anchorIndicator
				}}
				getContainer={(): HTMLElement => scrollContainer ?? document.body}
				getCurrentAnchor={(): string => activeHref}
				items={items}
				onClick={(event: React.MouseEvent<HTMLElement>, link: { href: string }): void => {
					event.preventDefault();
					const entry: SessionTimelineNavigationEntry | undefined = entriesByHref.get(link.href);
					if (entry !== undefined) {
						onNavigate(entry);
					}
				}}
			/>
		</nav>
	);
}
