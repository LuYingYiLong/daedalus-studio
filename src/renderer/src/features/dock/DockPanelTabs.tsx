import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty } from "antd";
import PanelTabs, { type PanelTabsAddItem, type PanelTabsItem } from "@/features/panel-tabs/PanelTabs";
import { Icon } from "@/assets/icons";
import GitDiffReviewPanel from "@/features/review/GitDiffReviewPanel";
import TerminalPanel from "@/features/terminal/TerminalPanel";
import styles from "./DockPanelTabs.module.css";

export type DockPanelKind = "review" | "terminal";

export type DockPanelPlacement = "side" | "bottom";

export type DockPanelActivationRequest = {
	id: number;
	kind: DockPanelKind;
};

type DockPanelTabsProps = {
	dockId: string;
	placement: DockPanelPlacement;
	workspaceId: string | null;
	cwd: string | null;
	isOpen: boolean;
	defaultKind: DockPanelKind;
	activationRequest?: DockPanelActivationRequest | null;
	onEmpty: () => void;
};

type DockTab = {
	key: string;
	kind: DockPanelKind;
	index: number;
	title: string;
};

const ADD_REVIEW_KEY: DockPanelKind = "review";
const ADD_TERMINAL_KEY: DockPanelKind = "terminal";

function getPanelTitle(kind: DockPanelKind, index: number): string {
	if (kind === "review") {
		return index === 1 ? "Changes" : `Changes ${index}`;
	}
	return index === 1 ? "Terminal" : `Terminal ${index}`;
}

function createDockTab(dockId: string, kind: DockPanelKind, index: number): DockTab {
	return {
		key: `${dockId}:${kind}:${index}`,
		kind,
		index,
		title: getPanelTitle(kind, index)
	};
}

function getNextIndex(tabs: DockTab[], kind: DockPanelKind): number {
	return tabs
		.filter((tab: DockTab): boolean => tab.kind === kind)
		.reduce((nextIndex: number, tab: DockTab): number => Math.max(nextIndex, tab.index + 1), 1);
}

function isTerminalTabKey(tabKey: string): boolean {
	return tabKey.includes(":terminal:");
}

function getTabIconName(kind: DockPanelKind): string {
	return kind === "review" ? "edit-add-remove" : "terminal";
}

function reorderTabs(tabs: DockTab[], sourceKey: string, targetKey: string): DockTab[] {
	const sourceIndex: number = tabs.findIndex((tab: DockTab): boolean => tab.key === sourceKey);
	const targetIndex: number = tabs.findIndex((tab: DockTab): boolean => tab.key === targetKey);
	if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
		return tabs;
	}

	const nextTabs: DockTab[] = [...tabs];
	const [movedTab] = nextTabs.splice(sourceIndex, 1);
	if (movedTab === undefined) {
		return tabs;
	}
	nextTabs.splice(targetIndex, 0, movedTab);
	return nextTabs;
}

function DockPanelTabs({
	dockId,
	placement,
	workspaceId,
	cwd,
	isOpen,
	defaultKind,
	activationRequest = null,
	onEmpty
}: DockPanelTabsProps): React.JSX.Element {
	const handledActivationIdRef = useRef<number | null>(null);
	const [tabs, setTabs] = useState<DockTab[]>(() => {
		return [createDockTab(dockId, defaultKind, 1)];
	});
	const [activeKey, setActiveKey] = useState<string>(() => tabs[0]?.key ?? "");
	const canOpenReview: boolean = workspaceId !== null;
	const addItems: PanelTabsAddItem[] = useMemo((): PanelTabsAddItem[] => [
		{
			key: ADD_REVIEW_KEY,
			label: "Review panel",
			icon: <Icon name="edit-add-remove" />,
			disabled: !canOpenReview
		},
		{
			key: ADD_TERMINAL_KEY,
			label: "Terminal panel",
			icon: <Icon name="terminal" />
		}
	], [canOpenReview]);

	const addPanelTab = useCallback((kind: DockPanelKind): void => {
		if (kind === "review" && workspaceId === null) {
			return;
		}

		setTabs((currentTabs: DockTab[]): DockTab[] => {
			const nextTab: DockTab = createDockTab(dockId, kind, getNextIndex(currentTabs, kind));
			setActiveKey(nextTab.key);
			return [...currentTabs, nextTab];
		});
	}, [dockId, workspaceId]);

	const ensurePanelTab = useCallback((kind: DockPanelKind): void => {
		setTabs((currentTabs: DockTab[]): DockTab[] => {
			const existingTab: DockTab | undefined = currentTabs.find((tab: DockTab): boolean => tab.kind === kind);
			if (existingTab !== undefined) {
				setActiveKey(existingTab.key);
				return currentTabs;
			}

			const nextTab: DockTab = createDockTab(dockId, kind, getNextIndex(currentTabs, kind));
			setActiveKey(nextTab.key);
			return [...currentTabs, nextTab];
		});
	}, [dockId]);

	useEffect((): void => {
		if (activationRequest === null || handledActivationIdRef.current === activationRequest.id) {
			return;
		}

		handledActivationIdRef.current = activationRequest.id;
		ensurePanelTab(activationRequest.kind);
	}, [activationRequest, ensurePanelTab]);

	useEffect((): void => {
		if (!isOpen || tabs.length > 0) {
			return;
		}

		ensurePanelTab(defaultKind);
	}, [defaultKind, ensurePanelTab, isOpen, tabs.length]);

	function closeDockTab(targetKey: string): void {
		if (isTerminalTabKey(targetKey)) {
			void window.electronAPI.terminal.kill({ terminalId: targetKey }).catch((error: unknown): void => {
				console.error("[DockPanelTabs] failed to kill terminal tab", error);
			});
		}

		setTabs((currentTabs: DockTab[]): DockTab[] => {
			const targetIndex: number = currentTabs.findIndex((tab: DockTab): boolean => tab.key === targetKey);
			const nextTabs: DockTab[] = currentTabs.filter((tab: DockTab): boolean => tab.key !== targetKey);
			if (nextTabs.length === 0) {
				setActiveKey("");
				onEmpty();
				return [];
			}
			if (targetKey === activeKey) {
				const nextActiveTab: DockTab = nextTabs[Math.max(0, targetIndex - 1)] ?? nextTabs[0]!;
				setActiveKey(nextActiveTab.key);
			}
			return nextTabs;
		});
	}

	function handleAdd(kind: string): void {
		if (kind === ADD_REVIEW_KEY || kind === ADD_TERMINAL_KEY) {
			addPanelTab(kind);
		}
	}

	function reorderDockTab(sourceKey: string, targetKey: string): void {
		setTabs((currentTabs: DockTab[]): DockTab[] => reorderTabs(currentTabs, sourceKey, targetKey));
	}

	function renderTabContent(tab: DockTab): React.ReactNode {
		if (tab.kind === "review") {
			if (workspaceId === null) {
				return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No workspace selected" />;
			}
			return isOpen ? <GitDiffReviewPanel workspaceId={workspaceId} /> : null;
		}

		return (
			<TerminalPanel
				terminalId={tab.key}
				cwd={cwd}
				isOpen={isOpen && activeKey === tab.key}
			/>
		);
	}

	const panelItems: PanelTabsItem[] = tabs.map((tab: DockTab): PanelTabsItem => ({
		key: tab.key,
		label: (
			<span className={styles.tabLabel}>
				<Icon name={getTabIconName(tab.kind)} />
				{tab.title}
			</span>
		),
		forceRender: tab.kind === "terminal",
		children: renderTabContent(tab)
	}));

	return (
		<section className={`${styles.panel} ${placement === "side" ? styles.side : styles.bottom}`}>
			<PanelTabs
				activeKey={activeKey}
				items={panelItems}
				addItems={addItems}
				addLabel="Add panel"
				className={styles.tabs}
				onActiveChange={setActiveKey}
				onAdd={handleAdd}
				onClose={closeDockTab}
				onReorder={reorderDockTab}
			/>
		</section>
	);
}

export default DockPanelTabs;
