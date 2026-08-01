import { Anchor, Tooltip } from "antd";
import type { AnchorProps } from "antd";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SessionTimelineNavigationEntry } from "@/api/types";
import styles from "./ConversationAnchorNavigator.module.css";

export type ConversationAnchorNavigatorProps = {
	entries: SessionTimelineNavigationEntry[];
	activeEntryId: string | null;
	scrollContainer: HTMLElement | null;
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
	scrollContainer,
	onNavigate
}: ConversationAnchorNavigatorProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
	const navigatorRef = useRef<HTMLElement | null>(null);
	const entriesByHref: ReadonlyMap<string, SessionTimelineNavigationEntry> = useMemo((): ReadonlyMap<string, SessionTimelineNavigationEntry> => {
		return new Map(entries.map((entry: SessionTimelineNavigationEntry): [string, SessionTimelineNavigationEntry] => [entryHref(entry), entry]));
	}, [entries]);
	const activeEntry: SessionTimelineNavigationEntry | undefined = entries.find((entry: SessionTimelineNavigationEntry): boolean => entry.entryId === activeEntryId);
	const activeHref: string = activeEntry === undefined ? "" : entryHref(activeEntry);

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
