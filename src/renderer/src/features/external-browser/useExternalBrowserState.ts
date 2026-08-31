import { useEffect, useState } from "react";
import { getPlatformRuntime } from "@/platform/runtime/platform-runtime";
import { subscribeExternalBrowserState } from "./subscribe-external-browser-state";
import type {
	ExternalBrowserState,
	ExternalBrowserApi,
} from "../../../../contracts/external-browser";
export function useExternalBrowserState(): {
	state: ExternalBrowserState | null;
	api: ExternalBrowserApi | undefined;
} {
	const api = getPlatformRuntime().system?.externalBrowser,
		[state, setState] = useState<ExternalBrowserState | null>(null);
	useEffect(() => {
		if (!api) return;
		return subscribeExternalBrowserState(api, setState);
	}, [api]);
	return { state, api };
}
