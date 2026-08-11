import { Component, type ErrorInfo, type ReactNode } from "react";
import {
	createCompletedOnboardingPreferences,
	createDefaultOnboardingPreferences
} from "../../../../contracts/onboarding";
import { waitForRendererPaint } from "../runtime/renderer-paint";

type MainWindowErrorBoundaryProps = {
	children: ReactNode;
};

type MainWindowErrorBoundaryState = {
	error: Error | null;
	recovering: boolean;
};

function getCopy(): {
	title: string;
	description: string;
	reload: string;
	skip: string;
	reset: string;
	resetAll: string;
	resetAllConfirm: string;
	resetting: string;
} {
	return document.documentElement.lang === "zh-CN"
		? {
			title: "界面加载失败",
			description: "渲染状态出现异常，工作区文件不会因此被修改。可以先重新加载；如果问题由新手引导状态引起，可以重置引导并重新启动。",
			reload: "重新加载",
			skip: "跳过新手引导并进入 Studio",
			reset: "重置新手引导并重启",
			resetAll: "重置所有 Daedalus 数据",
			resetAllConfirm: "这将停止后端并清除 Studio 偏好、布局、项目缓存，以及 Daedalus backend 的配置、会话、缓存、日志和运行状态。工作区项目文件和系统密钥链不会被删除。确定继续吗？",
			resetting: "正在清除数据并重启…"
		}
		: {
			title: "The interface failed to load",
			description: "The renderer hit an unexpected state. Workspace files were not changed. Reload first, or reset onboarding and restart if the problem persists.",
			reload: "Reload",
			skip: "Skip onboarding and enter Studio",
			reset: "Reset onboarding and restart",
			resetAll: "Reset all Daedalus data",
			resetAllConfirm: "This will stop the backend and clear Studio preferences, layouts, project cache, and Daedalus backend configuration, sessions, cache, logs, and runtime state. Workspace project files and system keychain entries will not be deleted. Continue?",
			resetting: "Clearing data and restarting…"
		};
}

export default class MainWindowErrorBoundary extends Component<
	MainWindowErrorBoundaryProps,
	MainWindowErrorBoundaryState
> {
	state: MainWindowErrorBoundaryState = { error: null, recovering: false };

	static getDerivedStateFromError(error: Error): MainWindowErrorBoundaryState {
		return { error, recovering: false };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error("[Renderer] main window render failed", error, errorInfo);
		void waitForRendererPaint().then((): void => {
			window.electronAPI.windowControl.rendererReady();
		});
	}

	private reload(): void {
		window.location.reload();
	}

	private async resetOnboardingAndReload(): Promise<void> {
		this.setState({ error: this.state.error, recovering: true });
		try {
			await window.electronAPI.clientPreferences.update({
				onboarding: createDefaultOnboardingPreferences()
			});
			this.reload();
		} catch (error: unknown) {
			console.error("[Renderer] failed to reset onboarding", error);
			this.setState({ error: error instanceof Error ? error : new Error(String(error)), recovering: false });
		}
	}

	private async skipOnboardingAndReload(): Promise<void> {
		this.setState({ error: this.state.error, recovering: true });
		try {
			await window.electronAPI.clientPreferences.update({
				onboarding: createCompletedOnboardingPreferences()
			});
			this.reload();
		} catch (error: unknown) {
			console.error("[Renderer] failed to skip onboarding", error);
			this.setState({ error: error instanceof Error ? error : new Error(String(error)), recovering: false });
		}
	}

	private async resetAllDataAndRestart(): Promise<void> {
		if (this.state.recovering) {
			return;
		}
		const copy = getCopy();
		if (!window.confirm(copy.resetAllConfirm)) {
			return;
		}

		this.setState({ error: this.state.error, recovering: true });
		try {
			await window.electronAPI.dataReset.resetAll();
			await window.electronAPI.windowControl.relaunch({ forceProcess: true });
		} catch (error: unknown) {
			console.error("[Renderer] failed to reset all Daedalus data", error);
			this.setState({ error: error instanceof Error ? error : new Error(String(error)), recovering: false });
		}
	}

	render(): ReactNode {
		if (this.state.error === null) {
			return this.props.children;
		}
		const copy = getCopy();
		return (
			<main
				data-studio-main-window-error="ready"
				style={{
					boxSizing: "border-box",
					display: "grid",
					minHeight: "100vh",
					placeItems: "center",
					padding: 32,
					background: "var(--ds-bg, #141414)",
					color: "var(--ds-text-primary, #e8e8e8)"
				}}
			>
				<section style={{ maxWidth: 620, textAlign: "center" }}>
					<h1>{copy.title}</h1>
					<p>{copy.description}</p>
					<p style={{ color: "var(--ds-text-muted, #8c8c8c)", overflowWrap: "anywhere" }}>
						{this.state.error.message}
					</p>
					<div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
						<button type="button" onClick={(): void => this.reload()}>{copy.reload}</button>
						<button
							type="button"
							disabled={this.state.recovering}
							onClick={(): void => { void this.skipOnboardingAndReload(); }}
						>
							{copy.skip}
						</button>
						<button
							type="button"
							disabled={this.state.recovering}
							onClick={(): void => { void this.resetOnboardingAndReload(); }}
						>
							{copy.reset}
						</button>
						<button
							type="button"
							disabled={this.state.recovering}
							style={{ color: "var(--ds-danger, #cf1322)" }}
							onClick={(): void => { void this.resetAllDataAndRestart(); }}
						>
							{this.state.recovering ? copy.resetting : copy.resetAll}
						</button>
					</div>
				</section>
			</main>
		);
	}
}
