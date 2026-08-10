export type ContextBudgetSegmentInput = {
	committedPercent: number;
	inputPercent: number;
	outputReservePercent: number;
	safetyMarginPercent: number;
};

export type ContextBudgetSegmentAllocation = {
	committedPercent: number;
	inputPercent: number;
	outputReservePercent: number;
	safetyMarginPercent: number;
	inputEndPercent: number;
	outputEndPercent: number;
};

function clampPercent(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export function normalizeContextBudgetSegments(input: ContextBudgetSegmentInput): ContextBudgetSegmentAllocation {
	const committedPercent: number = clampPercent(input.committedPercent);
	const rawSegments: number[] = [
		clampPercent(input.inputPercent),
		clampPercent(input.outputReservePercent),
		clampPercent(input.safetyMarginPercent)
	];
	const rawTotal: number = rawSegments.reduce((total: number, value: number): number => total + value, 0);
	const scale: number = rawTotal > 0 ? committedPercent / rawTotal : 0;
	const segments: number[] = rawTotal > 0
		? rawSegments.map((value: number): number => value * scale)
		: [committedPercent, 0, 0];
	const inputPercent: number = segments[0] ?? 0;
	const outputReservePercent: number = segments[1] ?? 0;
	const safetyMarginPercent: number = segments[2] ?? 0;

	return {
		committedPercent,
		inputPercent,
		outputReservePercent,
		safetyMarginPercent,
		inputEndPercent: inputPercent,
		outputEndPercent: inputPercent + outputReservePercent
	};
}
