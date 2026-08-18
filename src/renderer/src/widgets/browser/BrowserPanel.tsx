import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Empty, Input, Space, type MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import type { AdditionalContextItem } from "@/platform/rpc/types";
import type { BrowserPanelLayoutPreferences } from "@/domain/session/session-layout";
import type { BrowserElementSnapshot, BrowserPermissionRequest, BrowserViewState } from "../../../../contracts/browser";
import BrowserToolbar from "./BrowserToolbar";
import {
	BrowserClearDataModal,
	BrowserCredentialModal,
	BrowserDownloadsModal,
	BrowserHistoryModal,
	BrowserImportModal,
	BrowserPermissionModal
} from "./BrowserManagerModals";
import styles from "./BrowserPanel.module.css";
import { subscribeNativeViewOcclusion } from "./native-view-occlusion";

type BrowserPanelProps = {
	panelKey: string;
	sessionId: string | null;
	layout: BrowserPanelLayoutPreferences;
	isOpen: boolean;
	isActive: boolean;
	isFullscreen: boolean;
	onLayoutChange: (layout: BrowserPanelLayoutPreferences) => void;
	onAddContext: (item: AdditionalContextItem) => void;
};

type ManagerKind = "history" | "downloads" | "import" | "clear" | "credentials" | null;

function createBrowserId(sessionId: string | null, panelKey: string): string {
	const value: string = `${sessionId ?? "temporary"}:${panelKey}`;
	if (value.length <= 180) return value;
	let hash: number = 2166136261;
	for (let index: number = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
	return `browser:${(hash >>> 0).toString(36)}:${panelKey.slice(-120)}`;
}

function BrowserPanel({ panelKey, sessionId, layout, isOpen, isActive, isFullscreen, onLayoutChange, onAddContext }: BrowserPanelProps): React.JSX.Element {
	const { t } = useTranslation();
	const { message } = App.useApp();
	const browserId: string = useMemo((): string => createBrowserId(sessionId, panelKey), [panelKey, sessionId]);
	const hostRef = useRef<HTMLDivElement | null>(null);
	const layoutRef = useRef<BrowserPanelLayoutPreferences>(layout);
	const onLayoutChangeRef = useRef(onLayoutChange);
	const [state, setState] = useState<BrowserViewState>({ browserId, url: null, title: "", isLoading: false, canGoBack: false, canGoForward: false, error: null });
	const [address, setAddress] = useState<string>(layout.lastUrl ?? "");
	const [inspecting, setInspecting] = useState<boolean>(false);
	const [snapshot, setSnapshot] = useState<BrowserElementSnapshot | null>(null);
	const [annotation, setAnnotation] = useState<string>("");
	const [manager, setManager] = useState<ManagerKind>(null);
	const [permissionRequest, setPermissionRequest] = useState<BrowserPermissionRequest | null>(null);
	const [rendererOverlayOpen, setRendererOverlayOpen] = useState<boolean>(false);
	const [hasCredentials, setHasCredentials] = useState<boolean>(false);

	useEffect((): void => { layoutRef.current = layout; }, [layout]);
	useEffect((): void => { onLayoutChangeRef.current = onLayoutChange; }, [onLayoutChange]);
	useEffect((): (() => void) | void => {
		if (state.url === null) { setHasCredentials(false); return; }
		let current: boolean = true;
		void window.electronAPI.browser.passwords.forUrl(state.url).then((items): void => {
			if (current) setHasCredentials(items.length > 0);
		}).catch((): void => { if (current) setHasCredentials(false); });
		return (): void => { current = false; };
	}, [state.url]);

	useEffect((): (() => void) => {
		let disposed: boolean = false;
		void window.electronAPI.browser.view.create(browserId).then((initial: BrowserViewState): void => {
			if (disposed) return;
			setState(initial);
			if (initial.url === null && layoutRef.current.lastUrl !== null) void window.electronAPI.browser.view.navigate(browserId, layoutRef.current.lastUrl);
		}).catch((error: unknown): void => {
			if (!disposed) setState((current: BrowserViewState): BrowserViewState => ({ ...current, error: error instanceof Error ? error.message : String(error) }));
		});
		const disposeState = window.electronAPI.browser.view.onStateChanged((nextState: BrowserViewState): void => {
			if (nextState.browserId !== browserId) return;
			setState(nextState);
			if (nextState.url !== null) {
				setAddress(nextState.url);
				if (layoutRef.current.lastUrl !== nextState.url) onLayoutChangeRef.current({ lastUrl: nextState.url });
			}
		});
		const disposeSelection = window.electronAPI.browser.view.onElementSelected((event): void => {
			if (event.browserId !== browserId) return;
			setInspecting(false);
			setSnapshot(event.snapshot);
			setAnnotation("");
		});
		const disposeCancelled = window.electronAPI.browser.view.onInspectCancelled((event): void => {
			if (event.browserId === browserId) setInspecting(false);
		});
		const disposePermission = window.electronAPI.browser.permissions.onRequested((request: BrowserPermissionRequest): void => {
			if (request.browserId === browserId) setPermissionRequest(request);
		});
		return (): void => {
			disposed = true;
			disposeState();
			disposeSelection();
			disposeCancelled();
			disposePermission();
			void window.electronAPI.browser.view.destroy(browserId).catch((): void => {});
		};
	}, [browserId]);

	useEffect((): (() => void) => subscribeNativeViewOcclusion(setRendererOverlayOpen), []);

	const syncBounds = useCallback((): void => {
		const element: HTMLDivElement | null = hostRef.current;
		if (element === null) return;
		const rect: DOMRect = element.getBoundingClientRect();
		void window.electronAPI.browser.view.setBounds(browserId, { x: rect.left, y: rect.top, width: rect.width, height: rect.height }).catch((): void => {});
	}, [browserId]);

	useEffect((): (() => void) => {
		const element: HTMLDivElement | null = hostRef.current;
		if (element === null) return (): void => {};
		let frame: number | null = null;
		const schedule = (): void => {
			if (frame !== null) cancelAnimationFrame(frame);
			frame = requestAnimationFrame((): void => { frame = null; syncBounds(); });
		};
		const observer = new ResizeObserver(schedule);
		observer.observe(element);
		window.addEventListener("resize", schedule);
		window.addEventListener("scroll", schedule, true);
		schedule();
		return (): void => {
			observer.disconnect();
			window.removeEventListener("resize", schedule);
			window.removeEventListener("scroll", schedule, true);
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, [syncBounds]);

	const occluded: boolean = manager !== null || snapshot !== null || permissionRequest !== null || rendererOverlayOpen;
	useEffect((): void => {
		void window.electronAPI.browser.view.setVisible(browserId, isOpen && isActive && state.url !== null && state.error === null && !occluded).catch((): void => {});
		if (isOpen && isActive) syncBounds();
	}, [browserId, isActive, isOpen, occluded, state.error, state.url, syncBounds]);

	async function navigate(rawUrl: string = address): Promise<void> {
		try { await window.electronAPI.browser.view.navigate(browserId, rawUrl); }
		catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : String(error);
			if (!errorMessage.includes("ERR_ABORTED")) void message.error(error instanceof Error ? error.message : t("browser.errors.navigate"));
		}
	}

	function addSnapshotContext(): void {
		if (snapshot === null) return;
		const context: AdditionalContextItem = {
			id: `web-element-${crypto.randomUUID()}`,
			kind: "web_element",
			title: snapshot.pageTitle || snapshot.tagName,
			subtitle: snapshot.url,
			source: "manual",
			data: { ...snapshot, annotation: annotation.slice(0, 1200) }
		};
		onAddContext(context);
		setSnapshot(null);
		setAnnotation("");
		void message.success(t("browser.annotation.added"));
	}

	const menuItems: MenuProps["items"] = [
		{ key: "import", label: t("browser.menu.import"), onClick: (): void => setManager("import") },
		{ key: "downloads", label: t("browser.menu.downloads"), onClick: (): void => setManager("downloads") },
		{ key: "history", label: t("browser.menu.history"), onClick: (): void => setManager("history") },
		{ type: "divider" },
		{ key: "clear", label: t("browser.menu.clearData"), danger: true, onClick: (): void => setManager("clear") },
		{ key: "settings", label: t("browser.menu.settings"), onClick: (): void => { void window.electronAPI.windowControl.openSettings("browser"); } }
	];

	return (
		<section className={styles.panel}>
			<BrowserToolbar state={state} address={address} inspecting={inspecting} hasCredentials={hasCredentials} menuItems={menuItems} onAddressChange={setAddress} onNavigate={(): void => { void navigate(); }} onAction={(action): void => { void window.electronAPI.browser.view.action(browserId, action).catch((error: unknown): void => { void message.error(error instanceof Error ? error.message : String(error)); }); }} onInspect={(): void => { setInspecting((value: boolean): boolean => !value); void window.electronAPI.browser.view.inspect(browserId).catch((error: unknown): void => { setInspecting(false); void message.error(error instanceof Error ? error.message : String(error)); }); }} onOpenCredentials={(): void => setManager("credentials")} labels={{ back: t("browser.toolbar.back"), forward: t("browser.toolbar.forward"), reload: t("browser.toolbar.reload"), stop: t("browser.toolbar.stop"), address: t("browser.toolbar.address"), inspect: t("browser.toolbar.inspect"), credentials: t("browser.toolbar.credentials"), more: t("browser.toolbar.more") }} />
			<div className={`${styles.viewport} ${isFullscreen ? styles.viewportFullscreen : ""}`}>
				<div ref={hostRef} className={styles.nativeHost} />
				{state.url === null ? <div className={styles.empty}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("browser.empty.description")} /></div> : null}
				{state.error === null ? null : <div className={styles.error}><Alert type="error" showIcon message={t("browser.errors.load")} description={state.error} action={<Button onClick={(): void => { void navigate(state.url ?? address); }}>{t("browser.toolbar.reload")}</Button>} /></div>}
				{snapshot === null ? null : <div className={styles.annotationEditor}><Input value={annotation} maxLength={1200} autoFocus placeholder={t("browser.annotation.placeholder")} onChange={(event): void => setAnnotation(event.target.value)} onPressEnter={addSnapshotContext} onKeyDown={(event): void => { if (event.key === "Escape") setSnapshot(null); }} /><Space.Compact><Button onClick={(): void => setSnapshot(null)}>{t("browser.actions.cancel")}</Button><Button type="primary" onClick={addSnapshotContext}>{t("browser.annotation.add")}</Button></Space.Compact></div>}
			</div>
			<BrowserHistoryModal open={manager === "history"} onClose={(): void => setManager(null)} onNavigate={(url: string): void => { setAddress(url); void navigate(url); }} />
			<BrowserDownloadsModal open={manager === "downloads"} onClose={(): void => setManager(null)} />
			<BrowserImportModal open={manager === "import"} onClose={(): void => setManager(null)} />
			<BrowserClearDataModal open={manager === "clear"} onClose={(): void => setManager(null)} />
			<BrowserCredentialModal open={manager === "credentials"} onClose={(): void => setManager(null)} browserId={browserId} url={state.url} />
			<BrowserPermissionModal request={permissionRequest} onClose={(): void => setPermissionRequest(null)} />
		</section>
	);
}

export default BrowserPanel;
