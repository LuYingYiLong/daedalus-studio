import { useCallback, useState } from "react";
import App from "./App";
import BootSplash from "./BootSplash";
import { loadBootstrapData, type BootstrapData } from "./bootstrap";
import MainTitlebar from "./layout/Titlebar";
import OnboardingWizard from "./onboarding/OnboardingWizard";

function MainWindowRoot(): React.JSX.Element {
	const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);
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
				<BootSplash loadData={loadBootstrapData} onReady={handleBootstrapReady} />
			) : bootstrapData.clientPreferences.onboarding.completed ? (
				<App bootstrapData={bootstrapData} />
			) : (
				<OnboardingWizard bootstrapData={bootstrapData} onComplete={handleOnboardingComplete} />
			)}
		</>
	);
}

export default MainWindowRoot;
