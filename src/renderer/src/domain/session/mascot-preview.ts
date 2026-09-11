export type MascotStatus = "idle" | "thinking" | "executing" | "waiting" | "completed" | "failed" | "sleeping" | "disconnected";

const previews = new Map<string, MascotStatus>();
const listeners = new Set<() => void>();

export function subscribeMascotPreview(listener: () => void): () => void {
	listeners.add(listener);
	return () => { listeners.delete(listener); };
}

export function getMascotPreview(sessionId: string | null): MascotStatus | null {
	return sessionId === null ? null : previews.get(sessionId) ?? null;
}

export function finishMascotPreview(sessionId: string | null): void {
	if (sessionId === null || previews.get(sessionId) !== "completed") return;
	previews.set(sessionId, "idle");
	for (const listener of listeners) listener();
}

export function applyMascotPreview(value: unknown, requestId: string): void {
	if (!value || typeof value !== "object") throw new Error("Invalid mascot preview");
	const preview = value as Record<string, unknown>;
	if (preview.requestId !== requestId || typeof preview.sessionId !== "string" || !preview.sessionId
		|| (preview.status !== "idle" && preview.status !== "thinking" && preview.status !== "executing"
			&& preview.status !== "waiting" && preview.status !== "completed"
			&& preview.status !== "failed" && preview.status !== "sleeping"
			&& preview.status !== "disconnected" && preview.status !== "auto")) {
		throw new Error("Invalid mascot preview");
	}
	if (preview.status === "auto") previews.delete(preview.sessionId);
	else previews.set(preview.sessionId, preview.status as MascotStatus);
	for (const listener of listeners) listener();
}
