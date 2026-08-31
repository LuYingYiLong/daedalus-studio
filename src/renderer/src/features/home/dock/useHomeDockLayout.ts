import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { WorkspaceSidebarPreferences } from "@/platform/rpc/client-preferences-api";
import type { DockLayoutPreferences, SessionLayoutPreferences } from "@/domain/session/session-layout";

const DEFAULT_PERSIST_DELAY_MS: number = 360;

type PersistOptions = {
	persist?: boolean;
};

type UseHomeDockLayoutParams = {
	workspaceSidebar: WorkspaceSidebarPreferences;
	sessionLayout: SessionLayoutPreferences;
	sessionLayoutScopeId: string | null;
	onWorkspaceSidebarChange: (
		workspaceSidebar: WorkspaceSidebarPreferences,
		options?: PersistOptions,
	) => void;
	onSessionLayoutChange: (
		layout: SessionLayoutPreferences,
		options?: PersistOptions,
	) => void;
};

export type HomeDockLayoutController = {
	visualWorkspaceSidebar: WorkspaceSidebarPreferences;
	visualSessionLayout: SessionLayoutPreferences;
	visualWorkspaceSidebarRef: React.MutableRefObject<WorkspaceSidebarPreferences>;
	visualSessionLayoutRef: React.MutableRefObject<SessionLayoutPreferences>;
	applyVisualWorkspaceSidebar: (nextWorkspaceSidebar: WorkspaceSidebarPreferences) => void;
	applyVisualSessionLayout: (nextSessionLayout: SessionLayoutPreferences) => void;
	commitWorkspaceSidebar: (nextWorkspaceSidebar: WorkspaceSidebarPreferences, persist?: boolean) => void;
	commitSessionLayout: (nextSessionLayout: SessionLayoutPreferences, persist?: boolean) => void;
	scheduleWorkspaceSidebarSave: (nextWorkspaceSidebar: WorkspaceSidebarPreferences) => void;
	scheduleSessionLayoutSave: (nextSessionLayout: SessionLayoutPreferences) => void;
};

function areWorkspaceSidebarPreferencesEqual(
	left: WorkspaceSidebarPreferences,
	right: WorkspaceSidebarPreferences,
): boolean {
	return left.open === right.open && left.size === right.size;
}

function areDockLayoutPreferencesEqual(
	left: DockLayoutPreferences,
	right: DockLayoutPreferences,
): boolean {
	return left.open === right.open
		&& left.size === right.size
		&& left.activeTabKey === right.activeTabKey
		&& left.tabs.length === right.tabs.length
		&& left.tabs.every((tab, index): boolean => {
			const candidate = right.tabs[index];
			return candidate !== undefined
				&& tab.key === candidate.key
				&& tab.kind === candidate.kind
				&& tab.index === candidate.index;
		});
}

function areSessionLayoutPreferencesEqual(
	left: SessionLayoutPreferences,
	right: SessionLayoutPreferences,
): boolean {
	return (
		left.fullscreenDock === right.fullscreenDock &&
		areDockLayoutPreferencesEqual(left.side, right.side) &&
		areDockLayoutPreferencesEqual(left.bottom, right.bottom) &&
		JSON.stringify(left.filePanels) === JSON.stringify(right.filePanels) &&
		JSON.stringify(left.browserPanels) === JSON.stringify(right.browserPanels)
	);
}

function useHomeDockLayout({
	workspaceSidebar,
	sessionLayout,
	sessionLayoutScopeId,
	onWorkspaceSidebarChange,
	onSessionLayoutChange,
}: UseHomeDockLayoutParams): HomeDockLayoutController {
	const [visualWorkspaceSidebar, setVisualWorkspaceSidebar] =
		useState<WorkspaceSidebarPreferences>(workspaceSidebar);
	const [visualSessionLayout, setVisualSessionLayout] =
		useState<SessionLayoutPreferences>(sessionLayout);
	const visualWorkspaceSidebarRef = useRef<WorkspaceSidebarPreferences>(workspaceSidebar);
	const visualSessionLayoutRef = useRef<SessionLayoutPreferences>(sessionLayout);
	const previousSessionLayoutScopeIdRef = useRef<string | null>(sessionLayoutScopeId);
	const workspaceSidebarSaveTimerRef = useRef<number | null>(null);
	const sessionLayoutSaveTimerRef = useRef<number | null>(null);
	const pendingWorkspaceSidebarSaveRef = useRef<{
		value: WorkspaceSidebarPreferences;
		save: UseHomeDockLayoutParams["onWorkspaceSidebarChange"];
	} | null>(null);
	const pendingSessionLayoutSaveRef = useRef<{
		value: SessionLayoutPreferences;
		save: UseHomeDockLayoutParams["onSessionLayoutChange"];
	} | null>(null);

	const applyVisualWorkspaceSidebar = useCallback((nextWorkspaceSidebar: WorkspaceSidebarPreferences): void => {
		visualWorkspaceSidebarRef.current = nextWorkspaceSidebar;
		setVisualWorkspaceSidebar(nextWorkspaceSidebar);
	}, []);
	const applyVisualSessionLayout = useCallback((nextSessionLayout: SessionLayoutPreferences): void => {
		visualSessionLayoutRef.current = nextSessionLayout;
		setVisualSessionLayout(nextSessionLayout);
	}, []);
	const clearWorkspaceSidebarSave = useCallback((): void => {
		if (workspaceSidebarSaveTimerRef.current !== null) {
			window.clearTimeout(workspaceSidebarSaveTimerRef.current);
			workspaceSidebarSaveTimerRef.current = null;
		}
		pendingWorkspaceSidebarSaveRef.current = null;
	}, []);
	const clearSessionLayoutSave = useCallback((): void => {
		if (sessionLayoutSaveTimerRef.current !== null) {
			window.clearTimeout(sessionLayoutSaveTimerRef.current);
			sessionLayoutSaveTimerRef.current = null;
		}
		pendingSessionLayoutSaveRef.current = null;
	}, []);
	const flushWorkspaceSidebarSave = useCallback((): void => {
		const pendingSave = pendingWorkspaceSidebarSaveRef.current;
		clearWorkspaceSidebarSave();
		pendingSave?.save(pendingSave.value);
	}, [clearWorkspaceSidebarSave]);
	const flushSessionLayoutSave = useCallback((): void => {
		const pendingSave = pendingSessionLayoutSaveRef.current;
		clearSessionLayoutSave();
		pendingSave?.save(pendingSave.value);
	}, [clearSessionLayoutSave]);
	const commitWorkspaceSidebar = useCallback((nextWorkspaceSidebar: WorkspaceSidebarPreferences, persist: boolean = true): void => {
		clearWorkspaceSidebarSave();
		applyVisualWorkspaceSidebar(nextWorkspaceSidebar);
		onWorkspaceSidebarChange(nextWorkspaceSidebar, { persist });
	}, [applyVisualWorkspaceSidebar, clearWorkspaceSidebarSave, onWorkspaceSidebarChange]);
	const commitSessionLayout = useCallback((nextSessionLayout: SessionLayoutPreferences, persist: boolean = true): void => {
		clearSessionLayoutSave();
		applyVisualSessionLayout(nextSessionLayout);
		onSessionLayoutChange(nextSessionLayout, { persist });
	}, [applyVisualSessionLayout, clearSessionLayoutSave, onSessionLayoutChange]);
	const scheduleWorkspaceSidebarSave = useCallback((nextWorkspaceSidebar: WorkspaceSidebarPreferences): void => {
		applyVisualWorkspaceSidebar(nextWorkspaceSidebar);
		clearWorkspaceSidebarSave();
		pendingWorkspaceSidebarSaveRef.current = { value: nextWorkspaceSidebar, save: onWorkspaceSidebarChange };
		workspaceSidebarSaveTimerRef.current = window.setTimeout((): void => {
			const pendingSave = pendingWorkspaceSidebarSaveRef.current;
			workspaceSidebarSaveTimerRef.current = null;
			pendingWorkspaceSidebarSaveRef.current = null;
			pendingSave?.save(pendingSave.value);
		}, DEFAULT_PERSIST_DELAY_MS);
	}, [applyVisualWorkspaceSidebar, clearWorkspaceSidebarSave, onWorkspaceSidebarChange]);
	const scheduleSessionLayoutSave = useCallback((nextSessionLayout: SessionLayoutPreferences): void => {
		applyVisualSessionLayout(nextSessionLayout);
		clearSessionLayoutSave();
		pendingSessionLayoutSaveRef.current = { value: nextSessionLayout, save: onSessionLayoutChange };
		sessionLayoutSaveTimerRef.current = window.setTimeout((): void => {
			const pendingSave = pendingSessionLayoutSaveRef.current;
			sessionLayoutSaveTimerRef.current = null;
			pendingSessionLayoutSaveRef.current = null;
			pendingSave?.save(pendingSave.value);
		}, DEFAULT_PERSIST_DELAY_MS);
	}, [applyVisualSessionLayout, clearSessionLayoutSave, onSessionLayoutChange]);

	useEffect((): void => {
		if (!areWorkspaceSidebarPreferencesEqual(visualWorkspaceSidebarRef.current, workspaceSidebar)) {
			flushWorkspaceSidebarSave();
			applyVisualWorkspaceSidebar(workspaceSidebar);
		}
	}, [applyVisualWorkspaceSidebar, flushWorkspaceSidebarSave, workspaceSidebar]);
	useLayoutEffect((): void => {
		const sessionScopeChanged: boolean =
			previousSessionLayoutScopeIdRef.current !== sessionLayoutScopeId;
		previousSessionLayoutScopeIdRef.current = sessionLayoutScopeId;
		if (sessionScopeChanged || !areSessionLayoutPreferencesEqual(visualSessionLayoutRef.current, sessionLayout)) {
			flushSessionLayoutSave();
			applyVisualSessionLayout(sessionLayout);
		}
	}, [applyVisualSessionLayout, flushSessionLayoutSave, sessionLayout, sessionLayoutScopeId]);
	useEffect((): (() => void) => {
		return (): void => {
			flushWorkspaceSidebarSave();
			flushSessionLayoutSave();
		};
	}, [flushSessionLayoutSave, flushWorkspaceSidebarSave]);

	return {
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
	};
}

export default useHomeDockLayout;
