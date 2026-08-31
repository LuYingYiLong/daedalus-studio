import { createDockTab, type DockPanelKind } from "@/domain/session/dock-panels";
import type { DockLayoutPreferences } from "@/domain/session/session-layout";
import type { WorkspaceLaunchTargetId } from "@/domain/workspace/workspace-launch";

export function ensureDockTab(
	layout: DockLayoutPreferences,
	dockId: string,
	defaultKind: DockPanelKind,
): DockLayoutPreferences {
	const firstTab: DockLayoutPreferences["tabs"][number] | undefined = layout.tabs[0];
	if (firstTab !== undefined) {
		const activeTabKey: string | null = layout.tabs.some(
			(tab): boolean => tab.key === layout.activeTabKey,
		)
			? layout.activeTabKey
			: firstTab.key;
		return activeTabKey === layout.activeTabKey ? layout : { ...layout, activeTabKey };
	}
	const tab = createDockTab(dockId, defaultKind, 1);
	return { ...layout, tabs: [tab], activeTabKey: tab.key };
}

export function isWorkspaceLaunchTargetId(
	value: string,
): value is WorkspaceLaunchTargetId {
	return value === "file-explorer"
		|| value === "terminal"
		|| value === "vscode"
		|| value === "visual-studio"
		|| value === "github-desktop"
		|| value === "git-bash"
		|| value === "godot";
}

export function isGodotScenePath(relativePath: string): boolean {
	const normalizedPath: string = relativePath.toLowerCase();
	return normalizedPath.endsWith(".tscn") || normalizedPath.endsWith(".scn");
}

export function getPathBasename(inputPath: string): string {
	return inputPath.split(/[\\/]/u).filter(Boolean).at(-1) ?? inputPath;
}
