import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
	fetchClientPreferences,
	type ClientPreferences,
} from "@/platform/rpc/client-preferences-api";
import {
	fetchGeneralSettings,
	type GeneralSettings,
} from "@/platform/rpc/general-settings-api";
import {
	fetchProviderModelSelection,
	type ProviderModelSelection,
} from "@/platform/rpc/provider-api";

export type AppResourceBootstrapControllerParams = {
	setClientPreferences: Dispatch<SetStateAction<ClientPreferences>>;
	setGeneralSettings: Dispatch<SetStateAction<GeneralSettings>>;
	setProviderModelSelection: Dispatch<
		SetStateAction<ProviderModelSelection | null>
	>;
};

export default function useAppResourceBootstrapController({
	setClientPreferences,
	setGeneralSettings,
	setProviderModelSelection,
}: AppResourceBootstrapControllerParams): void {
	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadPreferences(): Promise<void> {
			try {
				const [preferences, settings] = await Promise.all([
					fetchClientPreferences(),
					fetchGeneralSettings(),
				]);
				if (!cancelled) {
					setClientPreferences(preferences);
					setGeneralSettings(settings);
				}
			} catch (error: unknown) {
				console.error("[App] load preferences failed", error);
			}
		}

		void loadPreferences();

		return (): void => {
			cancelled = true;
		};
	}, [setClientPreferences, setGeneralSettings]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadProviderModelSelection(): Promise<void> {
			try {
				const result: ProviderModelSelection =
					await fetchProviderModelSelection();

				if (!cancelled) {
					setProviderModelSelection(result);
				}
			} catch (error: unknown) {
				console.error(
					"[App] load provider model selection failed",
					error,
				);
			}
		}

		function handleWindowFocus(): void {
			void loadProviderModelSelection();
		}

		void loadProviderModelSelection();
		window.addEventListener("focus", handleWindowFocus);
		return (): void => {
			cancelled = true;
			window.removeEventListener("focus", handleWindowFocus);
		};
	}, [setProviderModelSelection]);
}
