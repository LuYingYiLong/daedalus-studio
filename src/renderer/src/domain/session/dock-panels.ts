import type { DockTabKind, DockTabPreferences } from "./session-layout";

export type DockPanelKind = DockTabKind;

export type DockPanelPlacement = "side" | "bottom";

export type DockPanelActivationRequest = {
	id: number;
	kind: DockPanelKind;
};

export function createDockTab(
	dockId: string,
	kind: DockPanelKind,
	index: number,
): DockTabPreferences {
	return {
		key: `${dockId}:${kind}:${index}`,
		kind,
		index,
	};
}

export function getNextDockTabIndex(
	tabs: readonly DockTabPreferences[],
	kind: DockPanelKind,
): number {
	return tabs
		.filter((tab: DockTabPreferences): boolean => tab.kind === kind)
		.reduce(
			(nextIndex: number, tab: DockTabPreferences): number =>
				Math.max(nextIndex, tab.index + 1),
			1,
		);
}

export function reorderDockTabs(
	tabs: readonly DockTabPreferences[],
	sourceKey: string,
	targetKey: string,
): DockTabPreferences[] {
	const sourceIndex: number = tabs.findIndex(
		(tab: DockTabPreferences): boolean => tab.key === sourceKey,
	);
	const targetIndex: number = tabs.findIndex(
		(tab: DockTabPreferences): boolean => tab.key === targetKey,
	);
	if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
		return [...tabs];
	}

	const nextTabs: DockTabPreferences[] = [...tabs];
	const [movedTab] = nextTabs.splice(sourceIndex, 1);
	if (movedTab === undefined) {
		return [...tabs];
	}
	nextTabs.splice(targetIndex, 0, movedTab);
	return nextTabs;
}
