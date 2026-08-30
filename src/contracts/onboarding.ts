export const ONBOARDING_STEP_IDS = [
	"welcome",
	"provider",
	"godot_executable",
	"documentation",
	"godot_bridge",
	"complete"
] as const;

export type OnboardingStepId = typeof ONBOARDING_STEP_IDS[number];

export type OnboardingConfigurableStepId = Exclude<OnboardingStepId, "welcome" | "complete">;

export type OnboardingStepOutcome = "configured" | "skipped";

export type OnboardingPreferences = {
	schemaVersion: 1;
	completed: boolean;
	currentStep: OnboardingStepId;
	stepOutcomes: Partial<Record<OnboardingConfigurableStepId, OnboardingStepOutcome>>;
	completedAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function isOnboardingPreferences(value: unknown): value is OnboardingPreferences {
	if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.completed !== "boolean") {
		return false;
	}
	if (typeof value.currentStep !== "string" || !ONBOARDING_STEP_IDS.includes(value.currentStep as OnboardingStepId)) {
		return false;
	}
	if (value.completedAt !== null && typeof value.completedAt !== "string") {
		return false;
	}
	if (!isRecord(value.stepOutcomes)) {
		return false;
	}
	for (const stepId of ["provider", "godot_executable", "documentation", "godot_bridge"] as const) {
		const outcome: unknown = value.stepOutcomes?.[stepId];
		if (outcome !== undefined && outcome !== "configured" && outcome !== "skipped") {
			return false;
		}
	}
	return true;
}

export function createDefaultOnboardingPreferences(): OnboardingPreferences {
	return {
		schemaVersion: 1,
		completed: false,
		currentStep: "welcome",
		stepOutcomes: {},
		completedAt: null
	};
}

export function createCompletedOnboardingPreferences(completedAt: string = new Date().toISOString()): OnboardingPreferences {
	return {
		...createDefaultOnboardingPreferences(),
		completed: true,
		currentStep: "complete",
		completedAt
	};
}
