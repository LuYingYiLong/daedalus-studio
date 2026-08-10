import { describe, expect, it } from "vitest";
import {
	allocateContextBudgetSegments,
	createContextBudgetStrokeColors
} from "../../../src/renderer/src/domain/composer/context-budget-segments.js";

describe("context budget segments", () => {
	it("uses largest remainders and stays within twenty steps", (): void => {
		const allocation = allocateContextBudgetSegments({
			inputPercent: 43,
			outputReservePercent: 6,
			safetyMarginPercent: 1
		});
		expect(allocation.activeSteps).toBe(10);
		expect(allocation.inputSteps + allocation.outputReserveSteps + allocation.safetyMarginSteps).toBe(10);
		expect(allocation.safetyMarginSteps).toBe(1);
	});

	it("clamps overcommitted context to twenty steps", (): void => {
		const allocation = allocateContextBudgetSegments({
			inputPercent: 110,
			outputReservePercent: 10,
			safetyMarginPercent: 5
		});
		expect(allocation.activeSteps).toBe(20);
		expect(allocation.inputSteps + allocation.outputReserveSteps + allocation.safetyMarginSteps).toBe(20);
		expect(createContextBudgetStrokeColors(allocation, {
			input: "input",
			outputReserve: "output",
			safetyMargin: "safety"
		})).toHaveLength(20);
	});

	it("keeps a positive safety margin visible when only one step is available", (): void => {
		const allocation = allocateContextBudgetSegments({
			inputPercent: 3,
			outputReservePercent: 0,
			safetyMarginPercent: 0.2
		});
		expect(allocation.activeSteps).toBe(1);
		expect(allocation.safetyMarginSteps).toBe(1);
	});
});
