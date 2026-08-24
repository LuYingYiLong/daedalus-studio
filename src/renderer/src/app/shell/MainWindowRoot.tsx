import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import BootSplash from "../bootstrap/BootSplash";
import {
	loadBootstrapData,
	type BootstrapData,
	type BootstrapProgress,
} from "../bootstrap/bootstrap";
import MainTitlebar from "./Titlebar";
import OnboardingWizard from "../onboarding/OnboardingWizard";
import styles from "./MainWindowRoot.module.css";

type AppModule = typeof import("./App");
type AppHandoffPhase = "idle" | "preparing" | "entering" | "ready";
type HandoffCover = "boot" | "onboarding";

let appModulePromise: Promise<AppModule> | null = null;

function loadAppModule(): Promise<AppModule> {
	appModulePromise ??= import("./App");
	return appModulePromise;
}

function preloadAppModule(): void {
	void loadAppModule().catch((error: unknown): void => {
		console.error("[MainWindowRoot] App preload failed", error);
	});
}

const App = lazy(loadAppModule);

function MainWindowRoot(): React.JSX.Element {
	const { t } = useTranslation();
	const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(
		null,
	);
	const [appBootstrapData, setAppBootstrapData] =
		useState<BootstrapData | null>(null);
	const [handoffPhase, setHandoffPhase] = useState<AppHandoffPhase>("idle");
	const [handoffCover, setHandoffCover] = useState<HandoffCover>("boot");
	const rendererShellReadyReportedRef = useRef<boolean>(false);
	const loadData = useCallback(
		(
			onProgress: (progress: BootstrapProgress) => void,
		): Promise<BootstrapData> => loadBootstrapData(onProgress, t),
		[t],
	);
	const handleBootstrapReady = useCallback((data: BootstrapData): void => {
		setBootstrapData(data);
		if (data.clientPreferences?.onboarding?.completed === true) {
			preloadAppModule();
			setHandoffCover("boot");
			setAppBootstrapData(data);
			setHandoffPhase("preparing");
		}
	}, []);
	const handleOnboardingComplete = useCallback(
		(data: BootstrapData): void => {
			setBootstrapData(data);
			setHandoffCover("onboarding");
			setAppBootstrapData(data);
			setHandoffPhase("preparing");
		},
		[],
	);
	const handleAppPaintReady = useCallback((): void => {
		setHandoffPhase(
			(currentPhase: AppHandoffPhase): AppHandoffPhase =>
				currentPhase === "preparing" ? "entering" : currentPhase,
		);
	}, []);
	const handleBootSplashPaintReady = useCallback((): void => {
		if (rendererShellReadyReportedRef.current) {
			return;
		}
		rendererShellReadyReportedRef.current = true;
		window.electronAPI.windowControl.rendererReady();
	}, []);
	const isAppReady: boolean =
		handoffPhase === "entering" || handoffPhase === "ready";
	const showBootCover: boolean =
		bootstrapData === null ||
		(handoffPhase === "preparing" && handoffCover === "boot");
	const showOnboardingCover: boolean =
		bootstrapData !== null &&
		(handoffPhase === "idle" ||
			(handoffPhase === "preparing" && handoffCover === "onboarding"));
	const appLayerClassName: string = [
		styles.appLayer,
		handoffPhase === "preparing" ? styles.appPreparing : "",
		handoffPhase === "entering" ? styles.appEnter : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<>
			<MainTitlebar appReady={isAppReady} />
			<div className={styles.content} data-studio-main-window="true">
				{appBootstrapData === null ? null : (
					<Suspense fallback={null}>
						<div
							className={appLayerClassName}
							data-studio-app-layer="true"
							aria-hidden={
								handoffPhase === "preparing" ? true : undefined
							}
							inert={
								handoffPhase === "preparing" ? true : undefined
							}
							onAnimationEnd={(event): void => {
								if (
									event.target === event.currentTarget &&
									handoffPhase === "entering"
								) {
									setHandoffPhase("ready");
								}
							}}
						>
							<App
								bootstrapData={appBootstrapData}
								onReady={handleAppPaintReady}
							/>
						</div>
					</Suspense>
				)}
				{showBootCover ? (
					<div className={styles.cover} key="boot">
						<BootSplash
							loadData={loadData}
							onReady={handleBootstrapReady}
							onPaintReady={handleBootSplashPaintReady}
						/>
					</div>
				) : null}
				{showOnboardingCover && bootstrapData !== null ? (
					<div className={styles.cover} key="onboarding">
						<OnboardingWizard
							bootstrapData={bootstrapData}
							isEnteringStudio={handoffPhase === "preparing"}
							onPrewarmApp={preloadAppModule}
							onComplete={handleOnboardingComplete}
						/>
					</div>
				) : null}
			</div>
		</>
	);
}

export default MainWindowRoot;
