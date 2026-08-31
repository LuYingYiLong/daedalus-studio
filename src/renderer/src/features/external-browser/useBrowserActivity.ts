import { useEffect, useState } from "react";
import {
	createBackendClient,
	onBackendReconnected,
} from "@/platform/rpc/transport/backend-client";
import { getPlatformRuntime } from "@/platform/runtime/platform-runtime";
import { useComputerDeveloperMode } from "@/features/computer-observation/useComputerState";

export type BrowserActivityDetail = {
	id: string;
	summary: Record<string, unknown>;
	detailLevel: "full" | "summary" | "compacted";
	detail?: unknown;
	dataUrl?: string;
};

export function useBrowserActivity(sessionId: string, activityId: string) {
	const available = !!getPlatformRuntime().system?.externalBrowser;
	const developer = useComputerDeveloperMode();
	const [detail, setDetail] = useState<BrowserActivityDetail | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	useEffect(() => {
		if (!available) return;
		let alive = true,
			revision = 0;
		let offEvents: (() => void) | undefined;
		const reload = async (): Promise<void> => {
			const version = ++revision;
			setDetail(null);
			setLoading(true);
			setError(false);
			try {
				const client = await createBackendClient();
				const value = await client.request<BrowserActivityDetail>(
					"session.browserActivity.get",
					{ sessionId, id: activityId },
				);
				if (
					value.id !== activityId ||
					!["full", "summary", "compacted"].includes(value.detailLevel) ||
					(value.dataUrl && !value.dataUrl.startsWith("data:image/png;base64,"))
				)
					throw new Error("browser_activity_invalid");
				if (alive && version === revision)
					setDetail(
						developer
							? value
							: {
									id: value.id,
									summary: value.summary,
									detailLevel:
										value.detailLevel === "compacted" ? "compacted" : "summary",
								},
					);
			} catch {
				if (alive && version === revision) setError(true);
			} finally {
				if (alive && version === revision) setLoading(false);
			}
		};
		void reload();
		const offReconnect = onBackendReconnected(() => {
			void reload();
		});
		void createBackendClient()
			.then((client) => {
				if (!alive) return;
				offEvents = client.addEventListener((event) => {
					if (
						event.sessionId === sessionId &&
						event.event === "session.trace.updated"
					)
						void reload();
				});
			})
			.catch(() => {});
		return () => {
			alive = false;
			revision++;
			offEvents?.();
			offReconnect();
		};
	}, [available, developer, sessionId, activityId]);
	return { available, detail, loading, error };
}
