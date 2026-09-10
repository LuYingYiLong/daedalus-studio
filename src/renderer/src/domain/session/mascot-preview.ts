export type MascotStatus = "idle" | "thinking" | "executing" | "awaiting_approval" | "completed";

const previews = new Map<string, MascotStatus>();
const listeners = new Set<() => void>();

export function subscribeMascotPreview(listener: () => void): () => void {
	listeners.add(listener);
	return () => { listeners.delete(listener); };
}

export function getMascotPreview(sessionId: string | null): MascotStatus | null {
	return sessionId === null ? null : previews.get(sessionId) ?? null;
}

export function applyMascotPreview(value: unknown, requestId: string): void {
	if (!value || typeof value !== "object") throw new Error("Invalid mascot preview");
	const preview = value as Record<string, unknown>;
	if (preview.requestId !== requestId || typeof preview.sessionId !== "string" || !preview.sessionId
		|| (preview.status !== "idle" && preview.status !== "thinking" && preview.status !== "executing"
			&& preview.status !== "awaiting_approval" && preview.status !== "completed" && preview.status !== "auto")) {
		throw new Error("Invalid mascot preview");
	}
	if (preview.status === "auto") previews.delete(preview.sessionId);
	else previews.set(preview.sessionId, preview.status as MascotStatus);
	for (const listener of listeners) listener();
}
