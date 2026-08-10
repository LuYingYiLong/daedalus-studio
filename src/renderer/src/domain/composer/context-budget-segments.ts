export const CONTEXT_PROGRESS_STEPS = 20;

export type ContextBudgetSegmentInput = {
	inputPercent: number;
	outputReservePercent: number;
	safetyMarginPercent: number;
};

export type ContextBudgetSegmentAllocation = {
	inputSteps: number;
	outputReserveSteps: number;
	safetyMarginSteps: number;
	activeSteps: number;
};

function finiteNonNegative(value: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function allocateContextBudgetSegments(
	input: ContextBudgetSegmentInput,
	steps: number = CONTEXT_PROGRESS_STEPS
): ContextBudgetSegmentAllocation {
	const values: number[] = [
		finiteNonNegative(input.inputPercent),
		finiteNonNegative(input.outputReservePercent),
		finiteNonNegative(input.safetyMarginPercent)
	];
	const committedPercent: number = values.reduce((total: number, value: number): number => total + value, 0);
	const activeSteps: number = Math.max(0, Math.min(steps, Math.round((Math.min(100, committedPercent) / 100) * steps)));
	if (activeSteps === 0 || committedPercent === 0) {
		return { inputSteps: 0, outputReserveSteps: 0, safetyMarginSteps: 0, activeSteps: 0 };
	}

	const scale: number = committedPercent > 100 ? activeSteps / committedPercent : steps / 100;
	const exact: number[] = values.map((value: number): number => value * scale);
	const allocation: number[] = exact.map(Math.floor);
	let remaining: number = activeSteps - allocation.reduce((total: number, value: number): number => total + value, 0);
	const order: number[] = exact
		.map((value: number, index: number): { index: number; remainder: number } => ({ index, remainder: value - Math.floor(value) }))
		.sort((left, right): number => right.remainder - left.remainder || left.index - right.index)
		.map((item): number => item.index);
	for (let index: number = 0; index < remaining; index += 1) {
		allocation[order[index % order.length]!] += 1;
	}

	// Output reserve and safety margin are semantic boundaries. Keep one visible
	// step for a positive segment when the bar has room, borrowing from the
	// largest segment without changing the committed total.
	for (const index of [2, 1]) {
		if (values[index]! <= 0 || allocation[index]! > 0 || activeSteps === 0) continue;
		const donorCandidates: number[] = index === 2 ? [0, 1] : [0];
		const donor: number | undefined = donorCandidates
			.filter((candidate: number): boolean => allocation[candidate]! > 0)
			.sort((left: number, right: number): number => allocation[right]! - allocation[left]!)[0];
		if (donor !== undefined) {
			allocation[donor] -= 1;
			allocation[index] += 1;
		}
	}

	return {
		inputSteps: allocation[0] ?? 0,
		outputReserveSteps: allocation[1] ?? 0,
		safetyMarginSteps: allocation[2] ?? 0,
		activeSteps
	};
}

export function createContextBudgetStrokeColors(
	allocation: ContextBudgetSegmentAllocation,
	colors: { input: string; outputReserve: string; safetyMargin: string }
): string[] {
	return [
		...Array.from({ length: allocation.inputSteps }, (): string => colors.input),
		...Array.from({ length: allocation.outputReserveSteps }, (): string => colors.outputReserve),
		...Array.from({ length: allocation.safetyMarginSteps }, (): string => colors.safetyMargin)
	];
}
