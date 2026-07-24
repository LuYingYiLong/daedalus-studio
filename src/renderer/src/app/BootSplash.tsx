import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Progress, Result, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { loadBootstrapData, type BootstrapData, type BootstrapProgress } from "./bootstrap";
import styles from "./BootSplash.module.css";

type BootSplashProps = {
	onReady: (data: BootstrapData) => void;
};

type BootstrapState =
	| {
		status: "loading";
		progress: BootstrapProgress;
	}
	| {
		status: "error";
		title: string;
		details: string;
		suggestedAction: string | null;
		backendState: BackendBootstrapState | null;
	};

type Translate = (key: string) => string;

function createInitialProgress(t: Translate): BootstrapProgress {
	return {
		label: t("app.boot.progress.starting"),
		percent: 0
	};
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function getBackendBootstrapProgress(state: BackendBootstrapState, t: Translate): BootstrapProgress {
	const labelByPhase: Record<BackendBootstrapPhase, string> = {
		detect: t("app.boot.progress.checkingBackend"),
		resolve_latest: t("app.boot.progress.checkingBackendPackage"),
		install: t("app.boot.progress.installingBackend"),
		write_metadata: t("app.boot.progress.preparingBackend"),
		start: t("app.boot.progress.startingBackend"),
		health_check: t("app.boot.progress.checkingBackendHealth"),
		ready: t("app.boot.progress.backendReady"),
		error: t("app.boot.progress.backendStartupFailed")
	};
	return {
		label: labelByPhase[state.phase],
		percent: Math.max(0, Math.min(100, state.progress))
	};
}

function getFirstScreenProgress(progress: BootstrapProgress): BootstrapProgress {
	return {
		label: progress.label,
		percent: Math.max(70, Math.min(100, Math.round(70 + progress.percent * 0.3)))
	};
}

function getBackendErrorTitle(state: BackendBootstrapState, t: Translate): string {
	if (state.status === "unsupported") {
		return t("app.boot.error.developmentBackendNotRunning");
	}
	if (state.errorCode === "install_failed") {
		return t("app.boot.error.installFailed");
	}
	if (state.errorCode === "backend_missing") {
		return t("app.boot.error.backendMissing");
	}
	if (state.errorCode === "marked_backend_missing") {
		return t("app.boot.error.markedBackendMissing");
	}
	if (state.errorCode === "health_failed") {
		return t("app.boot.error.healthFailed");
	}
	return t("app.boot.error.studioStartFailed");
}

function createBackendErrorState(backendState: BackendBootstrapState, t: Translate): BootstrapState {
	return {
		status: "error",
		title: getBackendErrorTitle(backendState, t),
		details: backendState.errorMessage ?? t("app.boot.error.bootstrapFailed"),
		suggestedAction: backendState.suggestedAction,
		backendState
	};
}

function BootSplash({ onReady }: BootSplashProps): React.JSX.Element {
	const { t } = useTranslation();
	const [runId, setRunId] = useState<number>(0);
	const [actionKey, setActionKey] = useState<string | null>(null);
	const [state, setState] = useState<BootstrapState>({
		status: "loading",
		progress: createInitialProgress(t)
	});
	const loadingProgress: BootstrapProgress = state.status === "loading" ? state.progress : createInitialProgress(t);
	const runBootstrapAction = useCallback(async (action: "repair" | "retry-start"): Promise<void> => {
		setActionKey(action);
		try {
			const backendState: BackendBootstrapState = action === "repair"
				? await window.electronAPI.backendBootstrap.repair()
				: await window.electronAPI.backendBootstrap.retryStart();
			if (backendState.status === "healthy") {
				setRunId((currentRunId: number): number => currentRunId + 1);
				return;
			}
			setState(createBackendErrorState(backendState, t));
		} finally {
			setActionKey(null);
		}
	}, [t]);
	const resultExtra = useMemo((): React.ReactNode[] => {
		if (state.status !== "error") {
			return [];
		}
		const backendState: BackendBootstrapState | null = state.backendState;
		const actions: React.ReactNode[] = [
			<Button key="retry" type="primary" onClick={(): void => setRunId((currentRunId: number): number => currentRunId + 1)}>
				{t("app.boot.actions.retry")}
			</Button>
		];
		if (backendState?.packaged === true && backendState.errorCode === "install_failed") {
			actions.unshift(
				<Button key="retry-install" loading={actionKey === "repair"} onClick={(): void => { void runBootstrapAction("repair"); }}>
					{t("app.boot.actions.retryInstall")}
				</Button>
			);
		} else if (backendState?.packaged === true && (backendState.errorCode === "backend_missing" || backendState.errorCode === "marked_backend_missing")) {
			actions.unshift(
				<Button key="repair-backend" loading={actionKey === "repair"} onClick={(): void => { void runBootstrapAction("repair"); }}>
					{t("app.boot.actions.repairBackend")}
				</Button>
			);
		} else if (backendState?.packaged === true && backendState.errorCode === "health_failed") {
			actions.unshift(
				<Button
					key="restart-backend"
					loading={actionKey === "retry-start"}
					onClick={(): void => {
						void runBootstrapAction("retry-start");
					}}
				>
					{t("app.boot.actions.restartBackend")}
				</Button>,
				<Button key="repair-backend" loading={actionKey === "repair"} onClick={(): void => { void runBootstrapAction("repair"); }}>
					{t("app.boot.actions.repairBackend")}
				</Button>
			);
		}
		return actions;
	}, [actionKey, runBootstrapAction, state, t]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		const unsubscribe = window.electronAPI.backendBootstrap.onStateChanged((backendState: BackendBootstrapState): void => {
			if (cancelled || backendState.status === "error" || backendState.status === "unsupported") {
				return;
			}
			setState({
				status: "loading",
				progress: getBackendBootstrapProgress(backendState, t)
			});
		});
		setState({
			status: "loading",
			progress: createInitialProgress(t)
		});
		void window.electronAPI.backendBootstrap.prepare().then(async (backendState: BackendBootstrapState): Promise<void> => {
			if (cancelled) {
				return;
			}
			if (backendState.status !== "healthy") {
				setState(createBackendErrorState(backendState, t));
				return;
			}
			const data: BootstrapData = await loadBootstrapData((progress: BootstrapProgress): void => {
				if (cancelled) {
					return;
				}
				setState({
					status: "loading",
					progress: getFirstScreenProgress(progress)
				});
			});
			if (!cancelled) {
				onReady(data);
			}
		}).catch((error: unknown): void => {
			if (cancelled) {
				return;
			}
			const details: string = getErrorMessage(error);
			setState({
				status: "error",
				title: t("app.boot.error.studioStartFailed"),
				details,
				suggestedAction: null,
				backendState: null
			});
		});

		return (): void => {
			cancelled = true;
			unsubscribe();
		};
	}, [onReady, runId, t]);

	if (state.status === "error") {
		return (
			<main className={styles.root}>
				<Result
					className={styles.result}
					status={state.backendState === null || state.backendState.status === "unsupported" ? "error" : "500"}
					title={state.title}
					subTitle={(
						<div className={styles.resultDetails}>
							<Typography.Text>{state.details}</Typography.Text>
							{state.suggestedAction === null ? null : <Typography.Text type="secondary">{state.suggestedAction}</Typography.Text>}
						</div>
					)}
					extra={resultExtra}
				/>
			</main>
		);
	}

	return (
		<main className={styles.root}>
			<section className={styles.panel}>
				<div className={styles.brand}>
					<Typography.Title level={3}>Daedalus Studio</Typography.Title>
					<Typography.Text type="secondary">{loadingProgress.label}</Typography.Text>
				</div>
				<div className={styles.progress}>
					<Progress percent={loadingProgress.percent} status="active" />
				</div>
			</section>
		</main>
	);
}

export default BootSplash;
