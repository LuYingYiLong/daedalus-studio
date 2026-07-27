import { Anchor, Tooltip } from "antd";
import type { AnchorProps } from "antd";
import { useMemo, useState } from "react";
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
	const entriesByHref: ReadonlyMap<string, SessionTimelineNavigationEntry> = useMemo((): ReadonlyMap<string, SessionTimelineNavigationEntry> => {
		return new Map(entries.map((entry: SessionTimelineNavigationEntry): [string, SessionTimelineNavigationEntry] => [entryHref(entry), entry]));
	}, [entries]);
	const activeEntry: SessionTimelineNavigationEntry | undefined = entries.find((entry: SessionTimelineNavigationEntry): boolean => entry.entryId === activeEntryId);
	const activeHref: string = activeEntry === undefined ? "" : entryHref(activeEntry);

	const items: AnchorProps["items"] = entries.map((entry: SessionTimelineNavigationEntry, index: number) => {
		const distance: number = hoveredIndex === null ? -1 : Math.abs(index - hoveredIndex);
		const tooltipText: string = entry.preview.length > 0 ? entry.preview : t("agentPage.conversationNavigator.emptyMessage");
		return {
			key: entry.entryId,
			href: entryHref(entry),
			title: (
				<Tooltip title={<span className={styles.tooltipText}>{tooltipText}</span>} placement="right">
					<span
						aria-label={tooltipText}
						className={[
							styles.tick,
							entry.entryId === activeEntryId ? styles.tickActive : "",
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
		<nav className={styles.navigator} aria-label={t("agentPage.conversationNavigator.ariaLabel")}>
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
