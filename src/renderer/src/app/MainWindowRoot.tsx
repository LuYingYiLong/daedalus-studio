import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import App from "./App";
import BootSplash from "./BootSplash";
import { loadBootstrapData, type BootstrapData, type BootstrapProgress } from "./bootstrap";
import MainTitlebar from "./layout/Titlebar";
import OnboardingWizard from "./onboarding/OnboardingWizard";

function MainWindowRoot(): React.JSX.Element {
	const { t } = useTranslation();
	const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);
	const loadData = useCallback((onProgress: (progress: BootstrapProgress) => void): Promise<BootstrapData> => (
		loadBootstrapData(onProgress, t)
	), [t]);
	const handleBootstrapReady = useCallback((data: BootstrapData): void => {
		setBootstrapData(data);
	}, []);
	const handleOnboardingComplete = useCallback((data: BootstrapData): void => {
		setBootstrapData(data);
	}, []);
	const isAppReady: boolean = bootstrapData?.clientPreferences.onboarding.completed === true;

	return (
		<>
			<MainTitlebar appReady={isAppReady} />
			{bootstrapData === null ? (
				<BootSplash loadData={loadData} onReady={handleBootstrapReady} />
			) : bootstrapData.clientPreferences.onboarding.completed ? (
				<App bootstrapData={bootstrapData} />
			) : (
				<OnboardingWizard bootstrapData={bootstrapData} onComplete={handleOnboardingComplete} />
			)}
		</>
	);
}

export default MainWindowRoot;
