import { useEffect, useMemo, useState } from "react";
import PanelTabs, { type PanelTabsAddItem, type PanelTabsItem } from "@/features/panel-tabs/PanelTabs";
import { Icon } from "@/assets/icons";
import TerminalPanel from "./TerminalPanel";
import styles from "./TerminalPanelTabs.module.css";

type TerminalPanelTabsProps = {
	cwd: string | null;
	isOpen: boolean;
	onEmpty: () => void;
};

type TerminalTab = {
	key: string;
	title: string;
};

const ADD_TERMINAL_KEY: string = "terminal";

function createTerminalTab(index: number): TerminalTab {
	return {
		key: `terminal:${index}`,
		title: index === 1 ? "Terminal" : `Terminal ${index}`
	};
}

function getNextIndex(tabs: TerminalTab[]): number {
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

function TerminalPanelTabs({ cwd, isOpen, onEmpty }: TerminalPanelTabsProps): React.JSX.Element {
	const [tabs, setTabs] = useState<TerminalTab[]>([createTerminalTab(1)]);
	const [activeKey, setActiveKey] = useState<string>("terminal:1");
	const addItems: PanelTabsAddItem[] = useMemo((): PanelTabsAddItem[] => [{
		key: ADD_TERMINAL_KEY,
		label: "Terminal panel",
		icon: <Icon name="terminal" />
	}], []);

	useEffect((): void => {
		if (!isOpen || tabs.length > 0) {
			return;
		}
		const nextTab: TerminalTab = createTerminalTab(1);
		setTabs([nextTab]);
		setActiveKey(nextTab.key);
	}, [isOpen, tabs.length]);

	function addTerminalTab(): void {
		setTabs((currentTabs: TerminalTab[]): TerminalTab[] => {
			const nextTab: TerminalTab = createTerminalTab(getNextIndex(currentTabs));
			setActiveKey(nextTab.key);
			return [...currentTabs, nextTab];
		});
	}

	function closeTerminalTab(targetKey: string): void {
		void window.electronAPI.terminal.kill({ terminalId: targetKey }).catch((error: unknown): void => {
			console.error("[TerminalPanelTabs] failed to kill terminal tab", error);
		});
		setTabs((currentTabs: TerminalTab[]): TerminalTab[] => {
			const nextTabs: TerminalTab[] = currentTabs.filter((tab: TerminalTab): boolean => tab.key !== targetKey);
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
		if (kind === ADD_TERMINAL_KEY) {
			addTerminalTab();
		}
	}

	const panelItems: PanelTabsItem[] = tabs.map((tab: TerminalTab): PanelTabsItem => ({
		key: tab.key,
		label: (
			<span className={styles.tabLabel}>
				<Icon name="terminal" />
				{tab.title}
			</span>
		),
		forceRender: true,
		children: (
			<TerminalPanel
				terminalId={tab.key}
				cwd={cwd}
				isOpen={isOpen && activeKey === tab.key}
			/>
		)
	}));

	return (
		<section className={styles.panel}>
			<PanelTabs
				activeKey={activeKey}
				items={panelItems}
				addItems={addItems}
				addLabel="Add terminal panel"
				className={styles.tabs}
				onActiveChange={setActiveKey}
				onAdd={handleAdd}
				onClose={closeTerminalTab}
			/>
		</section>
	);
}

export default TerminalPanelTabs;
