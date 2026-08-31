import { useEffect } from "react";
import { useEventListener } from "ahooks";
import {
	CLIENT_PREFERENCES_CHANGED_EVENT,
	type ClientPreferences,
} from "@/platform/rpc/client-preferences-api";
import { NEW_SESSION_EVENT } from "@/domain/session/session-navigation-history";
import type { NewSessionLifecycleOptions } from "@/features/session/controllers/useSessionHomeNavigationController";

export type AppWindowEventControllerParams = {
	clientPreferencesRef: { current: ClientPreferences };
	setClientPreferences: (preferences: ClientPreferences) => void;
	handleInterruptedRunRetry: (runId: string) => Promise<void>;
	handleNewSession: (
		options?: NewSessionLifecycleOptions,
	) => Promise<void>;
};

export default function useAppWindowEventController({
	clientPreferencesRef,
	setClientPreferences,
	handleInterruptedRunRetry,
	handleNewSession,
}: AppWindowEventControllerParams): void {
	useEventListener(CLIENT_PREFERENCES_CHANGED_EVENT, (event: Event): void => {
		const preferences: ClientPreferences | undefined = (
			event as CustomEvent<ClientPreferences>
		).detail;
		if (preferences !== undefined) {
			clientPreferencesRef.current = preferences;
			setClientPreferences(preferences);
		}
	});

	useEventListener("daedalus:retry-agent-run", (event: Event): void => {
		const detail: unknown = (event as CustomEvent<unknown>).detail;
		if (
			typeof detail !== "object" ||
			detail === null ||
			!("runId" in detail) ||
			typeof (detail as { runId?: unknown }).runId !== "string"
		) {
			return;
		}
		void handleInterruptedRunRetry((detail as { runId: string }).runId);
	});

	useEffect((): (() => void) => {
		const handleNewSessionMenu = (): void => {
			void handleNewSession();
		};
		window.addEventListener(NEW_SESSION_EVENT, handleNewSessionMenu);
		return (): void => {
			window.removeEventListener(NEW_SESSION_EVENT, handleNewSessionMenu);
		};
	}, [handleNewSession]);
}
