import { describe, expect, it } from "vitest";
import { normalizeContextBudgetSegments } from "../../../src/renderer/src/domain/composer/context-budget-segments.js";

describe("context budget segments", () => {
	it("keeps continuous segment boundaries in the same order as the budget", (): void => {
		const allocation = normalizeContextBudgetSegments({
			committedPercent: 50,
			inputPercent: 43,
			outputReservePercent: 6,
			safetyMarginPercent: 1
		});
		expect(allocation.inputPercent).toBe(43);
		expect(allocation.outputReservePercent).toBe(6);
		expect(allocation.safetyMarginPercent).toBe(1);
		expect(allocation.inputEndPercent).toBe(43);
		expect(allocation.outputEndPercent).toBe(49);
	});

	it("scales rounded segments to the committed window percentage", (): void => {
		const allocation = normalizeContextBudgetSegments({
			committedPercent: 100,
			inputPercent: 110,
			outputReservePercent: 10,
			safetyMarginPercent: 5
		});
		expect(allocation.inputPercent + allocation.outputReservePercent + allocation.safetyMarginPercent).toBeCloseTo(100);
		expect(allocation.outputEndPercent).toBeCloseTo(95.6522, 3);
	});

	it("falls back to a single continuous input segment for legacy estimates", (): void => {
		const allocation = normalizeContextBudgetSegments({
			committedPercent: 3.2,
			inputPercent: 3,
			outputReservePercent: 0,
			safetyMarginPercent: 0
		});
		expect(allocation.inputPercent).toBe(3.2);
		expect(allocation.outputEndPercent).toBe(3.2);
	});
});
