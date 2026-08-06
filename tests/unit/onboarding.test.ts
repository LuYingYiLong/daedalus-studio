import { describe, expect, it } from "vitest";
import {
	createCompletedOnboardingPreferences,
	createDefaultOnboardingPreferences,
	isOnboardingPreferences
} from "../../src/onboarding";

describe("onboarding runtime state", () => {
	it("accepts the persisted default state", () => {
		expect(isOnboardingPreferences(createDefaultOnboardingPreferences())).toBe(true);
	});

	it("creates a valid completed state for the recovery action", () => {
		const completed = createCompletedOnboardingPreferences("2026-08-07T00:00:00.000Z");
		expect(completed.completed).toBe(true);
		expect(completed.currentStep).toBe("complete");
		expect(completed.completedAt).toBe("2026-08-07T00:00:00.000Z");
		expect(isOnboardingPreferences(completed)).toBe(true);
	});

	it("rejects incomplete or malformed persisted state instead of letting the renderer crash", () => {
		const defaults = createDefaultOnboardingPreferences();
		expect(isOnboardingPreferences({ ...defaults, stepOutcomes: undefined })).toBe(false);
		expect(isOnboardingPreferences({
			...defaults,
			stepOutcomes: { provider: "unexpected" }
		})).toBe(false);
		expect(isOnboardingPreferences({ ...defaults, currentStep: "missing" })).toBe(false);
	});
});
