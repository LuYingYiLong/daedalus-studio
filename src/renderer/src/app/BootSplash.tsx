import { useEffect, useMemo, useState } from "react";
import { Button, Progress, Result, Typography } from "antd";
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
		isBackendFailure: boolean;
	};

const INITIAL_PROGRESS: BootstrapProgress = {
	label: "Starting Daedalus Studio",
	percent: 0
};

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isBackendFailureMessage(message: string): boolean {
	const normalized: string = message.toLowerCase();
	return normalized.includes("backend")
		|| normalized.includes("websocket")
		|| normalized.includes("后端")
		|| normalized.includes("无法连接");
}

function BootSplash({ onReady }: BootSplashProps): React.JSX.Element {
	const [runId, setRunId] = useState<number>(0);
	const [state, setState] = useState<BootstrapState>({
		status: "loading",
		progress: INITIAL_PROGRESS
	});
	const loadingProgress: BootstrapProgress = state.status === "loading" ? state.progress : INITIAL_PROGRESS;
	const resultExtra = useMemo((): React.ReactNode[] => {
		if (state.status !== "error") {
			return [];
		}
		const actions: React.ReactNode[] = [
			<Button key="retry" type="primary" onClick={(): void => setRunId((currentRunId: number): number => currentRunId + 1)}>
				Retry
			</Button>
		];
		if (state.isBackendFailure) {
			actions.unshift(
				<Button
					key="restart-backend"
					onClick={(): void => {
						void window.electronAPI.backend.restart().finally((): void => {
							setRunId((currentRunId: number): number => currentRunId + 1);
						});
					}}
				>
					Restart backend
				</Button>
			);
		}
		return actions;
	}, [state]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		setState({
			status: "loading",
			progress: INITIAL_PROGRESS
		});
		void loadBootstrapData((progress: BootstrapProgress): void => {
			if (!cancelled) {
				setState({
					status: "loading",
					progress
				});
			}
		}).then((data: BootstrapData): void => {
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
				title: "Daedalus Studio could not start",
				details,
				isBackendFailure: isBackendFailureMessage(details)
			});
		});

		return (): void => {
			cancelled = true;
		};
	}, [onReady, runId]);

	if (state.status === "error") {
		return (
			<main className={styles.root}>
				<Result
					className={styles.result}
					status={state.isBackendFailure ? "500" : "error"}
					title={state.title}
					subTitle={state.details}
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
