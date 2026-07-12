export function formatShortDateTime(isoTime: string): string {
	return new Intl.DateTimeFormat(undefined, {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false
	}).format(new Date(isoTime));
}

export function formatElapsedTime(startIsoTime: string, endIsoTime: string): string | null {
	const startMs: number = new Date(startIsoTime).getTime();
	const endMs: number = new Date(endIsoTime).getTime();

	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
		return null;
	}

	const elapsedSeconds: number = Math.floor((endMs - startMs) / 1000);

	if (elapsedSeconds < 60) {
		return `${elapsedSeconds}s`;
	}

	const minutes: number = Math.floor(elapsedSeconds / 60);
	const seconds: number = elapsedSeconds % 60;

	return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
