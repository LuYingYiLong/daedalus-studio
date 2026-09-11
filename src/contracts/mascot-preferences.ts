export const DEFAULT_MASCOT_SIZE: number = 100;
export const MIN_MASCOT_SIZE: number = 60;
export const MAX_MASCOT_SIZE: number = 140;

export function normalizeMascotSize(
	value: unknown,
	fallback: number = DEFAULT_MASCOT_SIZE,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}

	return Math.min(MAX_MASCOT_SIZE, Math.max(MIN_MASCOT_SIZE, Math.trunc(value)));
}
