import { useEffect, useState } from "react";
import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import { getPlatformRuntime } from "@/platform/runtime/platform-runtime";
import {
	parseComputerObservation,
	type ComputerObservation,
} from "../../../../contracts/computer-observation";
import { useComputerDeveloperMode } from "./useComputerState";

type ComputerObservationDetailLevel =
	| "idle"
	| "loading"
	| "full"
	| "compacted"
	| "summary"
	| "error";

export function useComputerObservationHistory(
	sessionId: string,
	observationId: string,
) {
	const [requested, setRequested] = useState(false);
	const [state, setState] = useState<ComputerObservationDetailLevel>("idle");
	const [observation, setObservation] = useState<ComputerObservation | null>(
		null,
	);
	const available = !!getPlatformRuntime().system?.computerObservation;
	const developer = useComputerDeveloperMode();

	useEffect(() => {
		if (!developer) {
			setObservation(null);
			setState("summary");
			return;
		}
		if (!available || !requested) return;
		let active = true;
		setState("loading");
		setObservation(null);
		void createBackendClient()
			.then((client) =>
				client.request<{
					detailLevel: "full" | "summary" | "compacted";
					observation?: unknown;
					dataUrl?: string;
				}>("session.computerObservation.get", { sessionId, observationId }),
			)
			.then((value) => {
				if (!active) return;
				if (value.detailLevel === "full")
					setObservation(
						parseComputerObservation({
							...(value.observation as object),
							...(value.dataUrl ? { dataUrl: value.dataUrl } : {}),
						}),
					);
				setState(value.detailLevel);
			})
			.catch(() => {
				if (active) setState("error");
			});
		return () => {
			active = false;
		};
	}, [available, developer, requested, sessionId, observationId]);

	return {
		available,
		developer,
		requested,
		state,
		observation,
		request: () => setRequested(true),
	};
}
