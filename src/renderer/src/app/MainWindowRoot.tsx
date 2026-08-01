import { useCallback, useState } from "react";
import App from "./App";
import BootSplash from "./BootSplash";
import { loadBootstrapData, type BootstrapData } from "./bootstrap";
import MainTitlebar from "./layout/Titlebar";

function MainWindowRoot(): React.JSX.Element {
	const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);
	const handleBootstrapReady = useCallback((data: BootstrapData): void => {
		setBootstrapData(data);
	}, []);

	return (
		<>
			<MainTitlebar appReady={bootstrapData !== null} />
			{bootstrapData === null ? (
				<BootSplash loadData={loadBootstrapData} onReady={handleBootstrapReady} />
			) : <App bootstrapData={bootstrapData} />}
		</>
	);
}

export default MainWindowRoot;
