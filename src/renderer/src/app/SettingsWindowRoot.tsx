import { useCallback, useState } from "react";
import BootSplash from "./BootSplash";
import { loadSettingsBootstrapData, type SettingsBootstrapData } from "./bootstrap";
import SettingsWindow from "./SettingsWindow";

function SettingsWindowRoot(): React.JSX.Element {
	const [bootstrapData, setBootstrapData] = useState<SettingsBootstrapData | null>(null);
	const handleBootstrapReady = useCallback((data: SettingsBootstrapData): void => {
		setBootstrapData(data);
	}, []);

	return (
		<>
			{bootstrapData === null ? (
				<BootSplash loadData={loadSettingsBootstrapData} onReady={handleBootstrapReady} />
			) : <SettingsWindow bootstrapData={bootstrapData} />}
		</>
	);
}

export default SettingsWindowRoot;
