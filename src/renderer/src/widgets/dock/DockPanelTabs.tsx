import { useCallback, useEffect, useMemo, useRef } from "react";
import { Empty } from "antd";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import PanelTabs, { type PanelTabsAddItem, type PanelTabsItem } from "@/widgets/panel-tabs/PanelTabs";
import { Icon } from "@/assets/icons";
import GitDiffReviewPanel from "@/widgets/git/review/GitDiffReviewPanel";
import TerminalPanel from "@/widgets/terminal/TerminalPanel";
import FilePanel from "@/widgets/files/FilePanel";
import type { AdditionalContextItem, WorkspaceConfig, WorkspaceSourceFolder } from "@/platform/rpc/types";
import type { WorkspaceLaunchTargetId } from "@/domain/workspace/workspace-launch";
import {
	createDefaultFilePanelLayout,
	createTerminalRuntimeId,
	type DockLayoutPreferences,
	type DockTabKind,
	type DockTabPreferences,
	type FilePanelLayoutPreferences
} from "@/domain/session/session-layout";
import styles from "./DockPanelTabs.module.css";

export type DockPanelKind = DockTabKind;

export type DockPanelPlacement = "side" | "bottom";

export type DockPanelActivationRequest = {
	id: number;
	kind: DockPanelKind;
};

type DockPanelTabsProps = {
	dockId: string;
	placement: DockPanelPlacement;
	sessionId: string | null;
	workspaceId: string | null;
	workspace: WorkspaceConfig | null;
	launchTargets: Array<{ id: WorkspaceLaunchTargetId; label: string }>;
	workspaceLaunchTargetId: WorkspaceLaunchTargetId;
	sourceFolderId?: string | null;
	sourceFolders: WorkspaceSourceFolder[];
	primarySourceFolderId?: string | null;
	onSourceFolderChange?: (sourceFolderId: string | null) => void;
	cwd: string | null;
	isOpen: boolean;
	waitForCwd: boolean;
	defaultKind: DockPanelKind;
	layout: DockLayoutPreferences;
	filePanels: Record<string, FilePanelLayoutPreferences>;
	activationRequest?: DockPanelActivationRequest | null;
	isFullscreen?: boolean;
	contextItems: AdditionalContextItem[];
	onAddContext: (item: AdditionalContextItem) => void;
	onRemoveContext: (contextId: string) => void;
	gitStateRevision?: number;
	onGitStateChange?: () => void | Promise<void>;
	onLayoutChange: (layout: DockLayoutPreferences) => void;
	onFilePanelChange: (panelKey: string, layout: FilePanelLayoutPreferences | null) => void;
	onFullscreenToggle?: () => void;
};

const ADD_REVIEW_KEY: DockPanelKind = "review";
const ADD_TERMINAL_KEY: DockPanelKind = "terminal";
const ADD_FILES_KEY: DockPanelKind = "files";

function getPanelTitle(kind: DockPanelKind, index: number, t: TFunction<"common">): string {
	if (kind === "review") {
		return index === 1 ? t("dock.tabs.changes") : t("dock.tabs.changesIndexed", { index });
	}
	if (kind === "terminal") {
		return index === 1 ? t("dock.tabs.terminal") : t("dock.tabs.terminalIndexed", { index });
	}
	return index === 1 ? t("dock.tabs.files") : t("dock.tabs.filesIndexed", { index });
}

export function createDockTab(dockId: string, kind: DockPanelKind, index: number): DockTabPreferences {
	return {
		key: `${dockId}:${kind}:${index}`,
		kind,
		index
	};
}

export function getNextDockTabIndex(tabs: DockTabPreferences[], kind: DockPanelKind): number {
	return tabs
		.filter((tab: DockTabPreferences): boolean => tab.kind === kind)
		.reduce((nextIndex: number, tab: DockTabPreferences): number => Math.max(nextIndex, tab.index + 1), 1);
}

export function reorderDockTabs(
	tabs: DockTabPreferences[],
	sourceKey: string,
	targetKey: string
): DockTabPreferences[] {
	const sourceIndex: number = tabs.findIndex((tab: DockTabPreferences): boolean => tab.key === sourceKey);
	const targetIndex: number = tabs.findIndex((tab: DockTabPreferences): boolean => tab.key === targetKey);
	if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
		return tabs;
	}

	const nextTabs: DockTabPreferences[] = [...tabs];
	const [movedTab] = nextTabs.splice(sourceIndex, 1);
	if (movedTab === undefined) {
		return tabs;
	}
	nextTabs.splice(targetIndex, 0, movedTab);
	return nextTabs;
}

function getTabIconName(kind: DockPanelKind): string {
	return kind === "review" ? "git-diff" : kind === "terminal" ? "terminal" : "file-system";
}

function DockPanelTabs({
	dockId,
	placement,
	sessionId,
	workspaceId,
	workspace,
	launchTargets,
	workspaceLaunchTargetId,
	sourceFolderId = null,
	sourceFolders,
	primarySourceFolderId = null,
	onSourceFolderChange,
	cwd,
	isOpen,
	waitForCwd,
	defaultKind,
	layout,
	filePanels,
	activationRequest = null,
	isFullscreen = false,
	contextItems,
	onAddContext,
	onRemoveContext,
	gitStateRevision = 0,
	onGitStateChange,
	onLayoutChange,
	onFilePanelChange,
	onFullscreenToggle
}: DockPanelTabsProps): React.JSX.Element {
	const { t } = useTranslation();
	const handledActivationIdRef = useRef<number | null>(null);
	const canOpenReview: boolean = workspaceId !== null;
	const activeKey: string = layout.tabs.some((tab: DockTabPreferences): boolean => tab.key === layout.activeTabKey)
		? layout.activeTabKey ?? ""
		: layout.tabs[0]?.key ?? "";
	const addItems: PanelTabsAddItem[] = useMemo((): PanelTabsAddItem[] => [
		{
			key: ADD_REVIEW_KEY,
			label: t("dock.add.reviewPanel"),
			icon: <Icon name="git-diff" />,
			disabled: !canOpenReview
		},
		{
			key: ADD_TERMINAL_KEY,
			label: t("dock.add.terminalPanel"),
			icon: <Icon name="terminal" />
		},
		{
			key: ADD_FILES_KEY,
			label: t("dock.add.filesPanel"),
			icon: <Icon name="file-system" />,
			disabled: !canOpenReview
		}
	], [canOpenReview, t]);

	const addPanelTab = useCallback((kind: DockPanelKind): void => {
		if ((kind === "review" || kind === "files") && workspaceId === null) {
			return;
		}
		const nextTab: DockTabPreferences = createDockTab(
			dockId,
			kind,
			getNextDockTabIndex(layout.tabs, kind)
		);
		onLayoutChange({
			...layout,
			tabs: [...layout.tabs, nextTab],
			activeTabKey: nextTab.key
		});
		if (kind === "files") {
			onFilePanelChange(nextTab.key, createDefaultFilePanelLayout());
		}
	}, [dockId, layout, onFilePanelChange, onLayoutChange, workspaceId]);

	const ensurePanelTab = useCallback((kind: DockPanelKind): void => {
		const existingTab: DockTabPreferences | undefined = layout.tabs.find(
			(tab: DockTabPreferences): boolean => tab.kind === kind
		);
		if (existingTab !== undefined) {
			if (activeKey !== existingTab.key) {
				onLayoutChange({ ...layout, activeTabKey: existingTab.key });
			}
			return;
		}

		const nextTab: DockTabPreferences = createDockTab(
			dockId,
			kind,
			getNextDockTabIndex(layout.tabs, kind)
		);
		onLayoutChange({
			...layout,
			tabs: [...layout.tabs, nextTab],
			activeTabKey: nextTab.key
		});
	}, [activeKey, dockId, layout, onLayoutChange]);

	useEffect((): void => {
		if (activationRequest === null || handledActivationIdRef.current === activationRequest.id) {
			return;
		}
		handledActivationIdRef.current = activationRequest.id;
		ensurePanelTab(activationRequest.kind);
	}, [activationRequest, ensurePanelTab]);

	useEffect((): void => {
		if (!isOpen || layout.tabs.length > 0) {
			return;
		}
		ensurePanelTab(defaultKind);
	}, [defaultKind, ensurePanelTab, isOpen, layout.tabs.length]);

	function closeDockTab(targetKey: string): void {
		const targetTab: DockTabPreferences | undefined = layout.tabs.find(
			(tab: DockTabPreferences): boolean => tab.key === targetKey
		);
		if (targetTab?.kind === "terminal") {
			void window.electronAPI.terminal.kill({
				terminalId: createTerminalRuntimeId(sessionId, targetKey)
			}).catch((error: unknown): void => {
				console.error("[DockPanelTabs] failed to kill terminal tab", error);
			});
		}
		if (targetTab?.kind === "files") {
			onFilePanelChange(targetKey, null);
		}

		const targetIndex: number = layout.tabs.findIndex((tab: DockTabPreferences): boolean => tab.key === targetKey);
		const nextTabs: DockTabPreferences[] = layout.tabs.filter(
			(tab: DockTabPreferences): boolean => tab.key !== targetKey
		);
		const nextActiveKey: string | null = targetKey === activeKey
			? nextTabs[Math.max(0, targetIndex - 1)]?.key ?? nextTabs[0]?.key ?? null
			: activeKey || nextTabs[0]?.key || null;
		onLayoutChange({
			...layout,
			open: nextTabs.length > 0 && layout.open,
			tabs: nextTabs,
			activeTabKey: nextActiveKey
		});
	}

	function handleAdd(kind: string): void {
		if (kind === ADD_REVIEW_KEY || kind === ADD_TERMINAL_KEY || kind === ADD_FILES_KEY) {
			addPanelTab(kind);
		}
	}

	function renderTabContent(tab: DockTabPreferences): React.ReactNode {
		if (tab.kind === "review") {
			if (workspaceId === null) {
				return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("dock.empty.noWorkspaceSelected")} />;
			}
			return isOpen
				? <GitDiffReviewPanel workspaceId={workspaceId} sourceFolderId={sourceFolderId} sourceFolders={sourceFolders} primarySourceFolderId={primarySourceFolderId} onSourceFolderChange={onSourceFolderChange} gitStateRevision={gitStateRevision} contextItems={contextItems} onAddContext={onAddContext} onRemoveContext={onRemoveContext} onGitStateChange={onGitStateChange} />
				: null;
		}

		if (tab.kind === "files") {
			return (
				<FilePanel
					panelKey={tab.key}
					sessionId={sessionId}
					workspace={workspace}
					layout={filePanels[tab.key] ?? createDefaultFilePanelLayout()}
					launchTargets={launchTargets}
					workspaceLaunchTargetId={workspaceLaunchTargetId}
					isFullscreen={isFullscreen}
					onLayoutChange={(nextLayout: FilePanelLayoutPreferences): void => onFilePanelChange(tab.key, nextLayout)}
					onAddContext={onAddContext}
				/>
			);
		}

		return (
			<TerminalPanel
				terminalId={createTerminalRuntimeId(sessionId, tab.key)}
				cwd={cwd}
				isOpen={isOpen && activeKey === tab.key}
				waitForCwd={waitForCwd}
			/>
		);
	}

	const panelItems: PanelTabsItem[] = layout.tabs.map((tab: DockTabPreferences): PanelTabsItem => ({
		key: tab.key,
		label: (
			<span className={styles.tabLabel}>
				<Icon name={getTabIconName(tab.kind)} />
				{getPanelTitle(tab.kind, tab.index, t)}
			</span>
		),
		forceRender: tab.kind === "terminal",
		children: renderTabContent(tab)
	}));

	return (
		<section className={`${styles.panel} ${placement === "side" ? styles.side : styles.bottom} ${isFullscreen ? styles.fullscreen : ""}`}>
			<PanelTabs
				activeKey={activeKey}
				items={panelItems}
				addItems={addItems}
				addLabel={t("dock.add.label")}
				isFullscreen={isFullscreen}
				fullscreenLabel={t("dock.tabs.enterFullscreen")}
				exitFullscreenLabel={t("dock.tabs.exitFullscreen")}
				onFullscreenToggle={onFullscreenToggle}
				className={styles.tabs}
				onActiveChange={(nextActiveKey: string): void => {
					onLayoutChange({ ...layout, activeTabKey: nextActiveKey });
				}}
				onAdd={handleAdd}
				onClose={closeDockTab}
				onReorder={(sourceKey: string, targetKey: string): void => {
					onLayoutChange({
						...layout,
						tabs: reorderDockTabs(layout.tabs, sourceKey, targetKey)
					});
				}}
			/>
		</section>
	);
}

export default DockPanelTabs;
