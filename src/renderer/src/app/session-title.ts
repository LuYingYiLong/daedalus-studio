import type { SessionMetadata } from "@/api/types";

export function getSessionTitle(metadata: SessionMetadata | null, sessionId: string | null): string {
	const title: string = metadata?.title.trim() ?? "";

	if (title.length > 0) {
		return title;
	}

	return sessionId ?? "Session";
}
