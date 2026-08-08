import type { SessionMetadata } from "@/platform/rpc/types";

export function getSessionTitle(metadata: SessionMetadata | null, sessionId: string | null): string {
	const rawTitle: unknown = metadata?.title;
	const title: string = typeof rawTitle === "string" ? rawTitle.trim() : "";

	if (title.length > 0) {
		return title;
	}

	const fallbackTitle: string = typeof sessionId === "string" ? sessionId.trim() : "";
	return fallbackTitle.length > 0 ? fallbackTitle : "Session";
}
