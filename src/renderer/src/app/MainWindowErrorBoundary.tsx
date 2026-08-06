import { Component, type ErrorInfo, type ReactNode } from "react";
import {
	createCompletedOnboardingPreferences,
	createDefaultOnboardingPreferences
} from "../../../onboarding";

type MainWindowErrorBoundaryProps = {
	children: ReactNode;
};

type MainWindowErrorBoundaryState = {
	error: Error | null;
	recovering: boolean;
};

function getCopy(): { title: string; description: string; reload: string; skip: string; reset: string } {
	return document.documentElement.lang === "zh-CN"
		? {
			title: "界面加载失败",
			description: "渲染状态出现异常，工作区文件不会因此被修改。可以先重新加载；如果问题由新手引导状态引起，可以重置引导并重新启动。",
			reload: "重新加载",
			skip: "跳过新手引导并进入 Studio",
			reset: "重置新手引导并重启"
		}
		: {
			title: "The interface failed to load",
			description: "The renderer hit an unexpected state. Workspace files were not changed. Reload first, or reset onboarding and restart if the problem persists.",
			reload: "Reload",
			skip: "Skip onboarding and enter Studio",
			reset: "Reset onboarding and restart"
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

	render(): ReactNode {
		if (this.state.error === null) {
			return this.props.children;
		}
		const copy = getCopy();
		return (
			<main
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
					</div>
				</section>
			</main>
		);
	}
}
