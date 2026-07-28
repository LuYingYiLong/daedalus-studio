import { useEffect, useState } from "react";
import type { BootstrapData } from "./bootstrap";
import SettingsPage, { isSettingsPageKey, type SettingsPageKey } from "@/pages/settings/SettingsPage";
import type { ProviderModelSelection } from "@/api/provider-api";
import type { ClientPreferences } from "@/api/client-preferences-api";
import type { GeneralSettings } from "@/api/general-settings-api";
import styles from "./SettingsWindow.module.css";

type SettingsWindowProps = {
	bootstrapData: BootstrapData;
};

function getInitialSettingsPage(): SettingsPageKey {
	const page: string | null = new URLSearchParams(window.location.search).get("page");
	return page !== null && isSettingsPageKey(page) ? page : "provider";
}

function SettingsWindow({ bootstrapData }: SettingsWindowProps): React.JSX.Element {
	const [initialPage, setInitialPage] = useState<SettingsPageKey>(getInitialSettingsPage);
	const [providerModelSelection, setProviderModelSelection] = useState<ProviderModelSelection>(bootstrapData.providerModelSelection);
	const [clientPreferences, setClientPreferences] = useState<ClientPreferences>(bootstrapData.clientPreferences);
	const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(bootstrapData.generalSettings);

	useEffect((): (() => void) => {
		return window.electronAPI.windowControl.onSettingsPageRequested((page: string): void => {
			if (isSettingsPageKey(page)) {
				setInitialPage(page);
			}
		});
	}, []);

	return (
		<main className={styles.surface}>
			<SettingsPage
				initialPage={initialPage}
				onProviderModelSelectionChange={setProviderModelSelection}
				clientPreferences={clientPreferences}
				generalSettings={generalSettings}
				onClientPreferencesChange={setClientPreferences}
				onGeneralSettingsChange={setGeneralSettings}
			/>
		</main>
	);
}

export default SettingsWindow;
