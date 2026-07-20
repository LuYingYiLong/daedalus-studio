import { useEffect, useMemo, useState } from "react";
import PanelTabs, { type PanelTabsAddItem, type PanelTabsItem } from "@/features/panel-tabs/PanelTabs";
import { Icon } from "@/assets/icons";
import GitDiffReviewPanel from "./GitDiffReviewPanel";
import styles from "./ReviewPanelTabs.module.css";

type ReviewPanelTabsProps = {
	workspaceId: string;
	onEmpty: () => void;
};

type ReviewTab = {
	key: string;
	title: string;
};

const ADD_REVIEW_KEY: string = "review";

function createReviewTab(index: number): ReviewTab {
	return {
		key: `review:${index}`,
		title: index === 1 ? "Changes" : `Changes ${index}`
	};
}

function getNextIndex(tabs: ReviewTab[]): number {
	let nextIndex: number = 1;
	for (const tab of tabs) {
		const [, rawIndex] = tab.key.split(":");
		const index: number = Number(rawIndex);
		if (Number.isFinite(index)) {
			nextIndex = Math.max(nextIndex, index + 1);
		}
	}
	return nextIndex;
}

function ReviewPanelTabs({ workspaceId, onEmpty }: ReviewPanelTabsProps): React.JSX.Element {
	const [tabs, setTabs] = useState<ReviewTab[]>([createReviewTab(1)]);
	const [activeKey, setActiveKey] = useState<string>("review:1");
	const addItems: PanelTabsAddItem[] = useMemo((): PanelTabsAddItem[] => [{
		key: ADD_REVIEW_KEY,
		label: "Review panel",
		icon: <Icon name="edit-add-remove" />
	}], []);

	useEffect((): void => {
		const firstTab: ReviewTab = createReviewTab(1);
		setTabs([firstTab]);
		setActiveKey(firstTab.key);
	}, [workspaceId]);

	function addReviewTab(): void {
		setTabs((currentTabs: ReviewTab[]): ReviewTab[] => {
			const nextTab: ReviewTab = createReviewTab(getNextIndex(currentTabs));
			setActiveKey(nextTab.key);
			return [...currentTabs, nextTab];
		});
	}

	function closeReviewTab(targetKey: string): void {
		setTabs((currentTabs: ReviewTab[]): ReviewTab[] => {
			const nextTabs: ReviewTab[] = currentTabs.filter((tab: ReviewTab): boolean => tab.key !== targetKey);
			if (nextTabs.length === 0) {
				setActiveKey("");
				onEmpty();
				return [];
			}
			if (targetKey === activeKey) {
				setActiveKey(nextTabs.at(-1)?.key ?? nextTabs[0]!.key);
			}
			return nextTabs;
		});
	}

	function handleAdd(kind: string): void {
		if (kind === ADD_REVIEW_KEY) {
			addReviewTab();
		}
	}

	const panelItems: PanelTabsItem[] = tabs.map((tab: ReviewTab): PanelTabsItem => ({
		key: tab.key,
		label: (
			<span className={styles.tabLabel}>
				<Icon name="edit-add-remove" />
				{tab.title}
			</span>
		),
		children: <GitDiffReviewPanel workspaceId={workspaceId} />
	}));

	return (
		<aside className={styles.panel}>
			<PanelTabs
				activeKey={activeKey}
				items={panelItems}
				addItems={addItems}
				addLabel="Add review panel"
				className={styles.tabs}
				onActiveChange={setActiveKey}
				onAdd={handleAdd}
				onClose={closeReviewTab}
			/>
		</aside>
	);
}

export default ReviewPanelTabs;
