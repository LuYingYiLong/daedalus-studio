import { Component, type ErrorInfo, type ReactNode } from "react";
import {
	createCompletedOnboardingPreferences,
	createDefaultOnboardingPreferences
} from "../../../../contracts/onboarding";
import { waitForRendererPaint } from "../runtime/renderer-paint";
import styles from "./MainWindowErrorBoundary.module.css";

const STUDIO_GITHUB_URL: string = "https://github.com/LuYingYiLong/daedalus-studio";

type MainWindowErrorBoundaryProps = {
	children: ReactNode;
};

type DiagnosticState = {
	loading: boolean;
	logLoading: boolean;
	backend: BackendDiagnostics | null;
	bootstrap: BackendBootstrapState | null;
	log: BackendLogTail | null;
	error: string | null;
};

type MainWindowErrorBoundaryState = {
	error: Error | null;
	recovering: boolean;
	detailsOpen: boolean;
	diagnostics: DiagnosticState;
};

type ErrorBoundaryCopy = {
	title: string;
	eyebrow: string;
	description: string;
	errorLabel: string;
	diagnostics: string;
	showDiagnostics: string;
	hideDiagnostics: string;
	backend: string;
	bootstrap: string;
	status: string;
	version: string;
	port: string;
	log: string;
	loadLog: string;
	openLog: string;
	logUnavailable: string;
	repair: string;
	retry: string;
	github: string;
	reload: string;
	skip: string;
	reset: string;
	resetAll: string;
	resetAllConfirm: string;
	resetting: string;
	noData: string;
	loading: string;
	logTruncated: string;
};

function getCopy(): ErrorBoundaryCopy {
	return document.documentElement.lang.toLowerCase().startsWith("zh")
		? {
			title: "界面加载失败",
			eyebrow: "恢复中心",
			description: "渲染状态出现异常，工作区文件不会因此被修改。你可以先重新加载；如果问题与后端启动有关，也可以在这里诊断、修复或查看日志。",
			errorLabel: "最近一次错误",
			diagnostics: "轻量诊断",
			showDiagnostics: "展开诊断",
			hideDiagnostics: "收起诊断",
			backend: "后端",
			bootstrap: "启动流程",
			status: "状态",
			version: "版本",
			port: "端口",
			log: "日志",
			loadLog: "显示最近日志",
			openLog: "打开日志文件",
			logUnavailable: "当前无法读取后端日志。后端可能尚未启动，或日志文件已被清理。",
			repair: "修复后端",
			retry: "重试启动",
			github: "打开 GitHub",
			reload: "重新加载",
			skip: "跳过新手引导并进入 Studio",
			reset: "重置新手引导并重启",
			resetAll: "重置所有 Daedalus 数据",
			resetAllConfirm: "这会停止后端并清除 Studio 偏好、布局、项目缓存，以及 Daedalus backend 的配置、会话、缓存、日志和运行状态。工作区项目文件和系统密钥链不会被删除。确定继续吗？",
			resetting: "正在清除数据并重启…",
			noData: "暂无可用信息",
			loading: "读取中…",
			logTruncated: "日志仅显示末尾部分"
		}
		: {
			title: "The interface failed to load",
			eyebrow: "Recovery center",
			description: "The renderer hit an unexpected state. Workspace files were not changed. Reload first, or diagnose and repair the backend below.",
			errorLabel: "Last error",
			diagnostics: "Lightweight diagnostics",
			showDiagnostics: "Show diagnostics",
			hideDiagnostics: "Hide diagnostics",
			backend: "Backend",
			bootstrap: "Bootstrap",
			status: "Status",
			version: "Version",
			port: "Port",
			log: "Logs",
			loadLog: "Show recent logs",
			openLog: "Open log file",
			logUnavailable: "The backend log is not available. The backend may not be running or the log may have been rotated.",
			repair: "Repair backend",
			retry: "Retry startup",
			github: "Open GitHub",
			reload: "Reload",
			skip: "Skip onboarding and enter Studio",
			reset: "Reset onboarding and restart",
			resetAll: "Reset all Daedalus data",
			resetAllConfirm: "This will stop the backend and clear Studio preferences, layouts, project cache, and Daedalus backend configuration, sessions, cache, logs, and runtime state. Workspace project files and system keychain entries will not be deleted. Continue?",
			resetting: "Clearing data and restarting…",
			noData: "No information available",
			loading: "Loading…",
			logTruncated: "Only the end of the log is shown"
		};
}

function createInitialDiagnostics(): DiagnosticState {
	return {
		loading: true,
		logLoading: false,
		backend: null,
		bootstrap: null,
		log: null,
		error: null
	};
}

function createInitialState(): MainWindowErrorBoundaryState {
	return {
		error: null,
		recovering: false,
		detailsOpen: false,
		diagnostics: createInitialDiagnostics()
	};
}

function formatValue(value: string | number | null | undefined, fallback: string): string {
	return value === null || value === undefined || value === "" ? fallback : String(value);
}

function formatBootstrapStatus(state: BackendBootstrapState | null, fallback: string): string {
	if (state === null) {
		return fallback;
	}
	return `${state.status} / ${state.phase}`;
}

export default class MainWindowErrorBoundary extends Component<
	MainWindowErrorBoundaryProps,
	MainWindowErrorBoundaryState
> {
	state: MainWindowErrorBoundaryState = createInitialState();
	private unmounted: boolean = false;

	static getDerivedStateFromError(error: Error): Partial<MainWindowErrorBoundaryState> {
		return {
			error,
			recovering: false,
			detailsOpen: false,
			diagnostics: createInitialDiagnostics()
		};
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error("[Renderer] main window render failed", error, errorInfo);
		void waitForRendererPaint().then((): void => {
			window.electronAPI.windowControl.rendererReady();
		});
		void this.loadDiagnostics();
	}

	componentWillUnmount(): void {
		this.unmounted = true;
	}

	private reload(): void {
		window.location.reload();
	}

	private async loadDiagnostics(): Promise<void> {
		const [bootstrapResult, backendResult] = await Promise.all([
			window.electronAPI.backendBootstrap.getState().catch((): BackendBootstrapState | null => null),
			window.electronAPI.backend.getDiagnostics().catch((error: unknown): BackendDiagnostics | null => {
				console.warn("[Renderer] failed to load backend diagnostics", error);
				return null;
			})
		]);
		if (this.unmounted) {
			return;
		}
		this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
			...currentState,
			diagnostics: {
				...currentState.diagnostics,
				loading: false,
				backend: backendResult,
				bootstrap: bootstrapResult,
				error: backendResult === null && bootstrapResult === null
					? "无法读取后端诊断信息"
					: null
			}
		}));
	}

	private async runBackendAction(action: "repair" | "retry"): Promise<void> {
		if (this.state.recovering) {
			return;
		}
		this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
			...currentState,
			recovering: true,
			diagnostics: { ...currentState.diagnostics, error: null }
		}));
		try {
			const bootstrap: BackendBootstrapState = action === "repair"
				? await window.electronAPI.backendBootstrap.repair()
				: await window.electronAPI.backendBootstrap.retryStart();
			if (bootstrap.status === "healthy") {
				this.reload();
				return;
			}
			this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
				...currentState,
				recovering: false,
				diagnostics: { ...currentState.diagnostics, bootstrap }
			}));
		} catch (error: unknown) {
			console.error(`[Renderer] backend ${action} failed`, error);
			if (!this.unmounted) {
				this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
					...currentState,
					recovering: false,
					diagnostics: {
						...currentState.diagnostics,
						error: error instanceof Error ? error.message : String(error)
					}
				}));
			}
		}
	}

	private async loadLog(): Promise<void> {
		if (this.state.diagnostics.logLoading) {
			return;
		}
		this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
			...currentState,
			diagnostics: { ...currentState.diagnostics, logLoading: true, error: null }
		}));
		try {
			const log: BackendLogTail = await window.electronAPI.backend.getLogTail();
			if (!this.unmounted) {
				this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
					...currentState,
					diagnostics: { ...currentState.diagnostics, logLoading: false, log }
				}));
			}
		} catch (error: unknown) {
			if (!this.unmounted) {
				this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
					...currentState,
					diagnostics: {
						...currentState.diagnostics,
						logLoading: false,
						error: error instanceof Error ? error.message : String(error)
					}
				}));
			}
		}
	}

	private async openLog(): Promise<void> {
		try {
			const result: { opened: boolean; path: string | null } = await window.electronAPI.backend.openLog();
			if (!result.opened && !this.unmounted) {
				this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
					...currentState,
					diagnostics: { ...currentState.diagnostics, error: getCopy().logUnavailable }
				}));
			}
		} catch (error: unknown) {
			if (!this.unmounted) {
				this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
					...currentState,
					diagnostics: {
						...currentState.diagnostics,
						error: error instanceof Error ? error.message : String(error)
					}
				}));
			}
		}
	}

	private async openGitHub(): Promise<void> {
		try {
			await window.electronAPI.windowControl.openExternal(STUDIO_GITHUB_URL);
		} catch (error: unknown) {
			console.error("[Renderer] failed to open GitHub", error);
			if (!this.unmounted) {
				this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
					...currentState,
					diagnostics: {
						...currentState.diagnostics,
						error: error instanceof Error ? error.message : String(error)
					}
				}));
			}
		}
	}

	private async resetOnboardingAndReload(): Promise<void> {
		this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
			...currentState,
			recovering: true
		}));
		try {
			await window.electronAPI.clientPreferences.update({
				onboarding: createDefaultOnboardingPreferences()
			});
			this.reload();
		} catch (error: unknown) {
			console.error("[Renderer] failed to reset onboarding", error);
			this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
				...currentState,
				recovering: false,
				error: error instanceof Error ? error : new Error(String(error))
			}));
		}
	}

	private async skipOnboardingAndReload(): Promise<void> {
		this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
			...currentState,
			recovering: true
		}));
		try {
			await window.electronAPI.clientPreferences.update({
				onboarding: createCompletedOnboardingPreferences()
			});
			this.reload();
		} catch (error: unknown) {
			console.error("[Renderer] failed to skip onboarding", error);
			this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
				...currentState,
				recovering: false,
				error: error instanceof Error ? error : new Error(String(error))
			}));
		}
	}

	private async resetAllDataAndRestart(): Promise<void> {
		if (this.state.recovering) {
			return;
		}
		const copy: ErrorBoundaryCopy = getCopy();
		if (!window.confirm(copy.resetAllConfirm)) {
			return;
		}

		this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
			...currentState,
			recovering: true
		}));
		try {
			await window.electronAPI.dataReset.resetAll();
			await window.electronAPI.windowControl.relaunch({ forceProcess: true });
		} catch (error: unknown) {
			console.error("[Renderer] failed to reset all Daedalus data", error);
			this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
				...currentState,
				recovering: false,
				error: error instanceof Error ? error : new Error(String(error))
			}));
		}
	}

	render(): ReactNode {
		if (this.state.error === null) {
			return this.props.children;
		}
		const copy: ErrorBoundaryCopy = getCopy();
		const diagnostics: DiagnosticState = this.state.diagnostics;
		const errorDetails: string = JSON.stringify({
			error: {
				name: this.state.error.name,
				message: this.state.error.message,
				stack: this.state.error.stack ?? null
			},
			backend: diagnostics.backend,
			bootstrap: diagnostics.bootstrap
		}, null, 2);

		return (
			<main className={styles.surface} data-studio-main-window-error="ready">
				<header className={styles.titlebar} aria-label="Daedalus Studio">
					<span className={styles.brand}>
						Daedalus Studio
					</span>
					<span className={styles.titlebarHint}>{copy.eyebrow}</span>
				</header>
				<div className={styles.scrollRegion}>
					<section className={styles.panel}>
						<p className={styles.eyebrow}>{copy.eyebrow}</p>
						<h1 className={styles.title}>{copy.title}</h1>
						<p className={styles.description}>{copy.description}</p>
						<div className={styles.errorCallout} role="alert">
							<p className={styles.errorLabel}>{copy.errorLabel}</p>
							<p className={styles.errorMessage}>{this.state.error.message}</p>
						</div>
						<div className={styles.actions}>
							<button className={`${styles.button} ${styles.primaryButton}`} type="button" disabled={this.state.recovering} onClick={(): void => this.reload()}>
								{copy.reload}
							</button>
							<button className={styles.button} type="button" disabled={this.state.recovering} onClick={(): void => { void this.runBackendAction("retry"); }}>
								{this.state.recovering ? copy.loading : copy.retry}
							</button>
							<button className={styles.button} type="button" disabled={this.state.recovering} onClick={(): void => { void this.runBackendAction("repair"); }}>
								{copy.repair}
							</button>
							<button className={styles.button} type="button" disabled={this.state.recovering} onClick={(): void => { void this.openGitHub(); }}>
								{copy.github}
							</button>
						</div>

						<section aria-label={copy.diagnostics}>
							<div className={styles.diagnosticsHeader}>
								<h2 className={styles.diagnosticsTitle}>{copy.diagnostics}</h2>
								<button
									className={styles.button}
									type="button"
									onClick={(): void => this.setState((currentState: MainWindowErrorBoundaryState): MainWindowErrorBoundaryState => ({
										...currentState,
										detailsOpen: !currentState.detailsOpen
									}))}
								>
									{this.state.detailsOpen ? copy.hideDiagnostics : copy.showDiagnostics}
								</button>
							</div>
							<div className={styles.statusGrid}>
								<div className={styles.statusItem}>
									<span className={styles.statusLabel}>{copy.backend}</span>
									<strong className={styles.statusValue}>{formatValue(diagnostics.backend?.status, diagnostics.loading ? copy.loading : copy.noData)}</strong>
								</div>
								<div className={styles.statusItem}>
									<span className={styles.statusLabel}>{copy.bootstrap}</span>
									<strong className={styles.statusValue}>{formatBootstrapStatus(diagnostics.bootstrap, diagnostics.loading ? copy.loading : copy.noData)}</strong>
								</div>
								<div className={styles.statusItem}>
									<span className={styles.statusLabel}>{copy.version}</span>
									<strong className={styles.statusValue}>{formatValue(diagnostics.backend?.version, copy.noData)}</strong>
								</div>
							</div>
							{this.state.detailsOpen ? (
								<>
									<div className={styles.detailActions}>
										<button className={styles.button} type="button" disabled={diagnostics.logLoading} onClick={(): void => { void this.loadLog(); }}>
											{diagnostics.logLoading ? copy.loading : copy.loadLog}
										</button>
										<button className={styles.button} type="button" onClick={(): void => { void this.openLog(); }}>
											{copy.openLog}
										</button>
									</div>
									{diagnostics.log !== null ? (
										<div className={styles.logPanel}>
											<p className={styles.logPath}>{diagnostics.log.path ?? copy.noData}</p>
											<pre className={styles.codeBlock}>{diagnostics.log.content || copy.logUnavailable}</pre>
											{diagnostics.log.truncated ? <p className={styles.muted}>{copy.logTruncated}</p> : null}
										</div>
									) : null}
									<pre className={styles.codeBlock}>{errorDetails}</pre>
								</>
							) : null}
							{diagnostics.error !== null ? <p className={styles.muted}>{diagnostics.error}</p> : null}
						</section>

						<div className={styles.actions}>
							<button className={styles.button} type="button" disabled={this.state.recovering} onClick={(): void => { void this.skipOnboardingAndReload(); }}>
								{copy.skip}
							</button>
							<button className={styles.button} type="button" disabled={this.state.recovering} onClick={(): void => { void this.resetOnboardingAndReload(); }}>
								{copy.reset}
							</button>
							<button className={`${styles.button} ${styles.dangerButton}`} type="button" disabled={this.state.recovering} onClick={(): void => { void this.resetAllDataAndRestart(); }}>
								{this.state.recovering ? copy.resetting : copy.resetAll}
							</button>
						</div>
					</section>
				</div>
			</main>
		);
	}
}
