import { useEffect, useState } from "react";
import { createBackendClient, onBackendReconnected } from "@/platform/rpc/transport/backend-client";
import type { BackendRpcClient } from "@/platform/rpc/transport/backend-rpc-client";
import { getPlatformRuntime } from "@/platform/runtime/platform-runtime";
import {
	parseComputerObservation,
	type ComputerObservation,
} from "../../../../contracts/computer-observation";
import { useComputerDeveloperMode } from "./useComputerState";
import {
	parseComputerGroundings,
	type ComputerGroundingResult,
} from "../../../../contracts/computer-grounding";

type ComputerObservationDetailLevel =
	| "idle"
	| "loading"
	| "full"
	| "compacted"
	| "summary"
	| "error";

type ComputerObservationDetailResponse = {
	detailLevel: "full" | "summary" | "compacted";
	observation?: unknown;
	dataUrl?: string;
	groundings?: unknown;
};

type ComputerObservationEvidenceDetail = {
	observation: ComputerObservation | null;
	groundings: ComputerGroundingResult[];
};

export function parseComputerObservationDetail(
	value: ComputerObservationDetailResponse,
	observationId: string,
): ComputerObservationEvidenceDetail {
	if (value.detailLevel !== "full")
		return { observation: null, groundings: [] };
	const observation = parseComputerObservation({
		...(value.observation as object),
		...(value.dataUrl ? { dataUrl: value.dataUrl } : {}),
	});
	const groundings = parseComputerGroundings(value.groundings === undefined ? [] : value.groundings);
	if (
		observation.observationId !== observationId ||
		groundings.some((result) => result.observationId !== observationId)
	)
		throw new Error("computer_observation_mismatch");
	if (groundings.some(result => result.candidates.some(({ box }) =>
		box.x > observation.width || box.y > observation.height ||
		box.width > observation.width - box.x || box.height > observation.height - box.y)))
		throw new Error("computer_grounding_invalid_response");
	return { observation, groundings };
}

export function useComputerObservationHistory(
	sessionId: string,
	observationId: string,
) {
	const [requested, setRequested] = useState(false);
	const [state, setState] = useState<ComputerObservationDetailLevel>("idle");
	const [detail, setDetail] = useState<ComputerObservationEvidenceDetail>({
		observation: null,
		groundings: [],
	});
	const available = !!getPlatformRuntime().system?.computerObservation;
	const developer = useComputerDeveloperMode();

	useEffect(() => {
		if (!developer) {
			setDetail({ observation: null, groundings: [] });
			setState("summary");
			return;
		}
		if (!available || !requested) return;
		let active = true;
		let revision = 0;
		let disposeEvents: (() => void) | undefined;
		const load = async (client: BackendRpcClient): Promise<void> => {
			if (!active) return;
			const current = ++revision;
			setState("loading");
			setDetail({ observation: null, groundings: [] });
			try {
				const value = await client.request<ComputerObservationDetailResponse>(
					"session.computerObservation.get", { sessionId, observationId },
				);
				if (!active || current !== revision) return;
				setDetail(parseComputerObservationDetail(value, observationId));
				setState(value.detailLevel);
			} catch {
				if (active && current === revision) setState("error");
			}
		};
		const reload = (): void => {
			void createBackendClient().then(load).catch(() => { if (active) setState("error"); });
		};
		const disposeReconnect = onBackendReconnected(reload);
		void createBackendClient()
			.then((client) => {
				if (!active) return;
				disposeEvents = client.addEventListener(event => {
					if (!active || event.sessionId !== sessionId || event.event !== "session.trace.updated") return;
					const data = event.data as { record?: { detailLevel?: string; summary?: { observationId?: string } } } | undefined;
					if (data?.record?.summary?.observationId !== observationId) return;
					if (data.record.detailLevel === "compacted") {
						// 精简通知立即清空证据，并使正在返回的旧详情失效
						revision++;
						setDetail({ observation: null, groundings: [] });
						setState("compacted");
					} else void load(client);
				});
				return load(client);
			})
			.catch(() => {
				if (active) setState("error");
			});
		return () => {
			active = false;
			revision++;
			disposeEvents?.();
			disposeReconnect();
		};
	}, [available, developer, requested, sessionId, observationId]);

	return {
		available,
		developer,
		requested,
		state,
		observation: detail.observation,
		groundings: detail.groundings,
		request: () => setRequested(true),
	};
}
