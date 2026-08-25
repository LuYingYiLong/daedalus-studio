import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { WorkspaceSidebarPreferences } from "@/platform/rpc/client-preferences-api";
import type { WorkspaceConfig } from "@/platform/rpc/types";
import {
	listTerminalRuntimeIds,
	type BrowserPanelLayoutPreferences,
	type DockFullscreenPlacement,
	type DockLayoutPreferences,
	type FilePanelLayoutPreferences,
	type SessionLayoutPreferences,
} from "@/domain/session/session-layout";
import type { DockPanelActivationRequest, DockPanelKind } from "@/widgets/dock/DockPanelTabs";
import { ensureDockTab } from "../layout/home-layout-model";
import useHomeDockLayout, {
	type HomeDockLayoutController,
} from "./useHomeDockLayout";

export const WORKSPACE_SIDEBAR_CLOSED_SIZE: number = 0;
export const WORKSPACE_SIDEBAR_MAX_SIZE: number = 720;
export const WORKSPACE_SIDEBAR_CLOSE_THRESHOLD: number = 150;
export const SIDE_DOCK_CLOSED_SIZE: number = 0;
export const SIDE_DOCK_MAX_SIZE: number = 720;
export const SIDE_DOCK_CLOSE_THRESHOLD: number = 150;
export const SIDE_DOCK_PROGRAMMATIC_OPEN_GUARD_MS: number = 400;
export const BOTTOM_DOCK_CLOSED_SIZE: number = 0;
export const BOTTOM_DOCK_MAX_SIZE: number = 520;
export const BOTTOM_DOCK_CLOSE_THRESHOLD: number = 120;

type UseHomePageDockControllerParams = {
	workspaceSidebar: WorkspaceSidebarPreferences;
	sessionLayout: SessionLayoutPreferences;
	onWorkspaceSidebarChange: (
		workspaceSidebar: WorkspaceSidebarPreferences,
		options?: { persist?: boolean },
	) => void;
	onSessionLayoutChange: (
		layout: SessionLayoutPreferences,
		options?: { persist?: boolean },
	) => void;
	activeSessionId: string | null;
	workspaceForActions: WorkspaceConfig | null;
};

export type HomePageDockController = HomeDockLayoutController & {
	fullscreenMotionDisabled: boolean;
	workspaceSidebarOpen: boolean;
	sideDockOpen: boolean;
	sideDockSize: number;
	bottomDockOpen: boolean;
	bottomDockSize: number;
	fullscreenDock: DockFullscreenPlacement | null;
	sideDockFullscreen: boolean;
	bottomDockFullscreen: boolean;
	isDockFullscreen: boolean;
	activeFullscreenDock: DockFullscreenPlacement | null;
	fullscreenDockLayout: DockLayoutPreferences | null;
	isFullscreenBrowserPanel: boolean;
	sideDockActivationRequest: DockPanelActivationRequest | null;
	updateSideDock: (
		nextSideLayout: DockLayoutPreferences,
		persist?: boolean,
	) => void;
	updateBottomDock: (
		nextBottomLayout: DockLayoutPreferences,
		persist?: boolean,
	) => void;
	updateFilePanel: (
		panelKey: string,
		nextFilePanel: FilePanelLayoutPreferences | null,
	) => void;
	updateBrowserPanel: (
		panelKey: string,
		nextBrowserPanel: BrowserPanelLayoutPreferences | null,
	) => void;
	toggleDockFullscreen: (placement: DockFullscreenPlacement) => void;
	requestSideDockKind: (kind: DockPanelKind) => void;
	openSideDock: (kind?: DockPanelKind) => void;
	closeSideDock: () => void;
	toggleSideDock: () => void;
	openReviewPanel: () => void;
	openBottomDock: () => void;
	closeBottomDock: () => void;
	toggleBottomDock: () => void;
	handleWorkspaceSidebarResize: (sizes: number[]) => void;
	handleWorkspaceSidebarResizeEnd: (sizes: number[]) => void;
	handleSideDockResize: (sizes: number[]) => void;
	handleSideDockResizeEnd: (sizes: number[]) => void;
	handleBottomDockResize: (sizes: number[]) => void;
	handleBottomDockResizeEnd: (sizes: number[]) => void;
};

function useHomePageDockController({
	workspaceSidebar,
	sessionLayout,
	onWorkspaceSidebarChange,
	onSessionLayoutChange,
	activeSessionId,
	workspaceForActions,
}: UseHomePageDockControllerParams): HomePageDockController {
	const layoutController: HomeDockLayoutController = useHomeDockLayout({
		workspaceSidebar,
		sessionLayout,
		onWorkspaceSidebarChange,
		onSessionLayoutChange,
	});
	const {
		visualWorkspaceSidebar,
		visualSessionLayout,
		visualWorkspaceSidebarRef,
		visualSessionLayoutRef,
		applyVisualWorkspaceSidebar,
		applyVisualSessionLayout,
		commitWorkspaceSidebar,
		commitSessionLayout,
		scheduleWorkspaceSidebarSave,
		scheduleSessionLayoutSave,
	} = layoutController;
	const [fullscreenMotionDisabled, setFullscreenMotionDisabled] =
		useState<boolean>(false);
	const dockActivationRequestIdRef = useRef<number>(0);
	const sideDockProgrammaticOpenUntilRef = useRef<number>(0);
	const [sideDockActivationRequest, setSideDockActivationRequest] =
		useState<DockPanelActivationRequest | null>(null);
	const previousSessionLayoutRef = useRef<{
		sessionId: string | null;
		layout: SessionLayoutPreferences;
	}>({
		sessionId: activeSessionId,
		layout: sessionLayout,
	});

	const workspaceSidebarOpen: boolean = visualWorkspaceSidebar.open;
	const sideDockOpen: boolean = visualSessionLayout.side.open;
	const sideDockSize: number = visualSessionLayout.side.size;
	const bottomDockOpen: boolean = visualSessionLayout.bottom.open;
	const bottomDockSize: number = visualSessionLayout.bottom.size;
	const fullscreenDock: DockFullscreenPlacement | null =
		visualSessionLayout.fullscreenDock;
	const sideDockFullscreen: boolean =
		fullscreenDock === "side" && sideDockOpen;
	const bottomDockFullscreen: boolean =
		fullscreenDock === "bottom" && bottomDockOpen;
	const isDockFullscreen: boolean =
		sideDockFullscreen || bottomDockFullscreen;
	const activeFullscreenDock: DockFullscreenPlacement | null =
		isDockFullscreen ? fullscreenDock : null;
	const fullscreenDockLayout: DockLayoutPreferences | null =
		activeFullscreenDock === "side"
			? visualSessionLayout.side
			: activeFullscreenDock === "bottom"
				? visualSessionLayout.bottom
				: null;
	const isFullscreenBrowserPanel: boolean =
		fullscreenDockLayout?.tabs.find(
			(tab): boolean => tab.key === fullscreenDockLayout.activeTabKey,
		)?.kind === "browser";

	const updateSideDock = useCallback(
		(
			nextSideLayout: DockLayoutPreferences,
			persist: boolean = true,
		): void => {
			commitSessionLayout(
				{
					...visualSessionLayoutRef.current,
					side: nextSideLayout,
				},
				persist,
			);
		},
		[commitSessionLayout, visualSessionLayoutRef],
	);

	const updateBottomDock = useCallback(
		(
			nextBottomLayout: DockLayoutPreferences,
			persist: boolean = true,
		): void => {
			commitSessionLayout(
				{
					...visualSessionLayoutRef.current,
					bottom: nextBottomLayout,
				},
				persist,
			);
		},
		[commitSessionLayout, visualSessionLayoutRef],
	);

	const updateFilePanel = useCallback(
		(
			panelKey: string,
			nextFilePanel: FilePanelLayoutPreferences | null,
		): void => {
			const nextFilePanels: Record<string, FilePanelLayoutPreferences> = {
				...visualSessionLayoutRef.current.filePanels,
			};
			if (nextFilePanel === null) {
				delete nextFilePanels[panelKey];
			} else {
				nextFilePanels[panelKey] = nextFilePanel;
			}
			commitSessionLayout({
				...visualSessionLayoutRef.current,
				filePanels: nextFilePanels,
			});
		},
		[commitSessionLayout, visualSessionLayoutRef],
	);

	const updateBrowserPanel = useCallback(
		(
			panelKey: string,
			nextBrowserPanel: BrowserPanelLayoutPreferences | null,
		): void => {
			const nextBrowserPanels: Record<
				string,
				BrowserPanelLayoutPreferences
			> = {
				...visualSessionLayoutRef.current.browserPanels,
			};
			if (nextBrowserPanel === null) {
				delete nextBrowserPanels[panelKey];
			} else {
				nextBrowserPanels[panelKey] = nextBrowserPanel;
			}
			commitSessionLayout({
				...visualSessionLayoutRef.current,
				browserPanels: nextBrowserPanels,
			});
		},
		[commitSessionLayout, visualSessionLayoutRef],
	);

	const toggleDockFullscreen = useCallback(
		(placement: DockFullscreenPlacement): void => {
			const currentPlacement: DockFullscreenPlacement | null =
				visualSessionLayoutRef.current.fullscreenDock;
			setFullscreenMotionDisabled(true);
			commitSessionLayout({
				...visualSessionLayoutRef.current,
				fullscreenDock:
					currentPlacement === placement ? null : placement,
			});
			window.requestAnimationFrame((): void => {
				setFullscreenMotionDisabled(false);
			});
		},
		[commitSessionLayout, visualSessionLayoutRef],
	);

	useLayoutEffect((): void => {
		const previous = previousSessionLayoutRef.current;
		if (previous.sessionId !== activeSessionId) {
			for (const terminalId of listTerminalRuntimeIds(
				previous.sessionId,
				previous.layout,
			)) {
				void window.electronAPI.terminal
					.kill({ terminalId })
					.catch((error: unknown): void => {
						console.error(
							"[HomePage] failed to stop previous session terminal",
							error,
						);
					});
			}
		}
		previousSessionLayoutRef.current = {
			sessionId: activeSessionId,
			layout: sessionLayout,
		};
	}, [activeSessionId, sessionLayout]);

	const requestSideDockKind = useCallback((kind: DockPanelKind): void => {
		dockActivationRequestIdRef.current += 1;
		setSideDockActivationRequest({
			id: dockActivationRequestIdRef.current,
			kind,
		});
	}, []);

	const openSideDock = useCallback(
		(kind?: DockPanelKind): void => {
			sideDockProgrammaticOpenUntilRef.current =
				performance.now() + SIDE_DOCK_PROGRAMMATIC_OPEN_GUARD_MS;
			const currentSideLayout: DockLayoutPreferences =
				visualSessionLayoutRef.current.side;
			const defaultKind: DockPanelKind =
				kind ?? (workspaceForActions === null ? "browser" : "review");
			commitSessionLayout({
				...visualSessionLayoutRef.current,
				side: {
					...ensureDockTab(currentSideLayout, "side", defaultKind),
					open: true,
				},
			});
			if (kind !== undefined) {
				requestSideDockKind(kind);
			}
		},
		[
			commitSessionLayout,
			requestSideDockKind,
			visualSessionLayoutRef,
			workspaceForActions,
		],
	);

	const closeSideDock = useCallback((): void => {
		sideDockProgrammaticOpenUntilRef.current = 0;
		commitSessionLayout({
			...visualSessionLayoutRef.current,
			fullscreenDock:
				visualSessionLayoutRef.current.fullscreenDock === "side"
					? null
					: visualSessionLayoutRef.current.fullscreenDock,
			side: { ...visualSessionLayoutRef.current.side, open: false },
		});
	}, [commitSessionLayout, visualSessionLayoutRef]);

	const toggleSideDock = useCallback((): void => {
		if (sideDockOpen) {
			closeSideDock();
			return;
		}
		openSideDock();
	}, [closeSideDock, openSideDock, sideDockOpen]);

	const openReviewPanel = useCallback((): void => {
		if (workspaceForActions === null) {
			return;
		}
		openSideDock("review");
	}, [openSideDock, workspaceForActions]);

	const openBottomDock = useCallback((): void => {
		const currentBottomLayout: DockLayoutPreferences =
			visualSessionLayoutRef.current.bottom;
		commitSessionLayout({
			...visualSessionLayoutRef.current,
			bottom: {
				...ensureDockTab(currentBottomLayout, "bottom", "terminal"),
				open: true,
			},
		});
	}, [commitSessionLayout, visualSessionLayoutRef]);

	const closeBottomDock = useCallback((): void => {
		commitSessionLayout({
			...visualSessionLayoutRef.current,
			fullscreenDock:
				visualSessionLayoutRef.current.fullscreenDock === "bottom"
					? null
					: visualSessionLayoutRef.current.fullscreenDock,
			bottom: { ...visualSessionLayoutRef.current.bottom, open: false },
		});
	}, [commitSessionLayout, visualSessionLayoutRef]);

	const toggleBottomDock = useCallback((): void => {
		if (bottomDockOpen) {
			closeBottomDock();
			return;
		}
		openBottomDock();
	}, [bottomDockOpen, closeBottomDock, openBottomDock]);

	const handleWorkspaceSidebarResize = useCallback(
		(sizes: number[]): void => {
			const nextSize: number | undefined = sizes[0];
			if (nextSize === undefined || !Number.isFinite(nextSize)) {
				return;
			}
			const normalizedSize: number = Math.min(
				WORKSPACE_SIDEBAR_MAX_SIZE,
				Math.max(WORKSPACE_SIDEBAR_CLOSED_SIZE, Math.trunc(nextSize)),
			);
			if (normalizedSize < WORKSPACE_SIDEBAR_CLOSE_THRESHOLD) {
				applyVisualWorkspaceSidebar({
					...visualWorkspaceSidebarRef.current,
					open: false,
				});
				return;
			}
			applyVisualWorkspaceSidebar({
				open: true,
				size: normalizedSize,
			});
		},
		[applyVisualWorkspaceSidebar, visualWorkspaceSidebarRef],
	);

	const handleWorkspaceSidebarResizeEnd = useCallback(
		(sizes: number[]): void => {
			const nextSize: number | undefined = sizes[0];
			if (nextSize === undefined || !Number.isFinite(nextSize)) {
				return;
			}
			if (nextSize < WORKSPACE_SIDEBAR_CLOSE_THRESHOLD) {
				commitWorkspaceSidebar({
					...visualWorkspaceSidebarRef.current,
					open: false,
				});
				return;
			}
			commitWorkspaceSidebar({
				open: true,
				size: Math.min(
					WORKSPACE_SIDEBAR_MAX_SIZE,
					Math.max(
						WORKSPACE_SIDEBAR_CLOSE_THRESHOLD,
						Math.trunc(nextSize),
					),
				),
			});
		},
		[commitWorkspaceSidebar, visualWorkspaceSidebarRef],
	);

	const handleSideDockResize = useCallback(
		(sizes: number[]): void => {
			const nextSize: number | undefined = sizes[1];
			if (nextSize === undefined || !Number.isFinite(nextSize)) {
				return;
			}
			const normalizedSize: number = Math.min(
				SIDE_DOCK_MAX_SIZE,
				Math.max(SIDE_DOCK_CLOSED_SIZE, Math.trunc(nextSize)),
			);
			if (normalizedSize < SIDE_DOCK_CLOSE_THRESHOLD) {
				if (
					performance.now() <
					sideDockProgrammaticOpenUntilRef.current
				) {
					return;
				}
				applyVisualSessionLayout({
					...visualSessionLayoutRef.current,
					side: { ...visualSessionLayoutRef.current.side, open: false },
				});
				return;
			}
			sideDockProgrammaticOpenUntilRef.current = 0;
			applyVisualSessionLayout({
				...visualSessionLayoutRef.current,
				side: {
					...visualSessionLayoutRef.current.side,
					open: true,
					size: normalizedSize,
				},
			});
		},
		[applyVisualSessionLayout, visualSessionLayoutRef],
	);

	const handleSideDockResizeEnd = useCallback(
		(sizes: number[]): void => {
			const nextSize: number | undefined = sizes[1];
			if (nextSize === undefined || !Number.isFinite(nextSize)) {
				return;
			}
			if (nextSize < SIDE_DOCK_CLOSE_THRESHOLD) {
				if (
					performance.now() <
					sideDockProgrammaticOpenUntilRef.current
				) {
					return;
				}
				commitSessionLayout({
					...visualSessionLayoutRef.current,
					side: { ...visualSessionLayoutRef.current.side, open: false },
				});
				return;
			}
			sideDockProgrammaticOpenUntilRef.current = 0;
			const validSize: number = Math.min(
				SIDE_DOCK_MAX_SIZE,
				Math.max(SIDE_DOCK_CLOSE_THRESHOLD, Math.trunc(nextSize)),
			);
			commitSessionLayout({
				...visualSessionLayoutRef.current,
				side: {
					...visualSessionLayoutRef.current.side,
					open: true,
					size: validSize,
				},
			});
		},
		[commitSessionLayout, visualSessionLayoutRef],
	);

	const handleBottomDockResize = useCallback(
		(sizes: number[]): void => {
			const nextSize: number | undefined = sizes[1];
			if (nextSize === undefined || !Number.isFinite(nextSize)) {
				return;
			}
			const normalizedSize: number = Math.min(
				BOTTOM_DOCK_MAX_SIZE,
				Math.max(BOTTOM_DOCK_CLOSED_SIZE, Math.trunc(nextSize)),
			);
			if (normalizedSize < BOTTOM_DOCK_CLOSE_THRESHOLD) {
				applyVisualSessionLayout({
					...visualSessionLayoutRef.current,
					bottom: {
						...visualSessionLayoutRef.current.bottom,
						open: false,
					},
				});
				return;
			}
			applyVisualSessionLayout({
				...visualSessionLayoutRef.current,
				bottom: {
					...visualSessionLayoutRef.current.bottom,
					open: true,
					size: normalizedSize,
				},
			});
		},
		[applyVisualSessionLayout, visualSessionLayoutRef],
	);

	const handleBottomDockResizeEnd = useCallback(
		(sizes: number[]): void => {
			const nextSize: number | undefined = sizes[1];
			if (nextSize === undefined || !Number.isFinite(nextSize)) {
				return;
			}
			if (nextSize < BOTTOM_DOCK_CLOSE_THRESHOLD) {
				commitSessionLayout({
					...visualSessionLayoutRef.current,
					bottom: {
						...visualSessionLayoutRef.current.bottom,
						open: false,
					},
				});
				return;
			}
			const validSize: number = Math.min(
				BOTTOM_DOCK_MAX_SIZE,
				Math.max(BOTTOM_DOCK_CLOSE_THRESHOLD, Math.trunc(nextSize)),
			);
			commitSessionLayout({
				...visualSessionLayoutRef.current,
				bottom: {
					...visualSessionLayoutRef.current.bottom,
					open: true,
					size: validSize,
				},
			});
		},
		[commitSessionLayout, visualSessionLayoutRef],
	);

	return {
		...layoutController,
		fullscreenMotionDisabled,
		workspaceSidebarOpen,
		sideDockOpen,
		sideDockSize,
		bottomDockOpen,
		bottomDockSize,
		fullscreenDock,
		sideDockFullscreen,
		bottomDockFullscreen,
		isDockFullscreen,
		activeFullscreenDock,
		fullscreenDockLayout,
		isFullscreenBrowserPanel,
		sideDockActivationRequest,
		updateSideDock,
		updateBottomDock,
		updateFilePanel,
		updateBrowserPanel,
		toggleDockFullscreen,
		requestSideDockKind,
		openSideDock,
		closeSideDock,
		toggleSideDock,
		openReviewPanel,
		openBottomDock,
		closeBottomDock,
		toggleBottomDock,
		handleWorkspaceSidebarResize,
		handleWorkspaceSidebarResizeEnd,
		handleSideDockResize,
		handleSideDockResizeEnd,
		handleBottomDockResize,
		handleBottomDockResizeEnd,
	};
}

export default useHomePageDockController;
