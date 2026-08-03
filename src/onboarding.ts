export const ONBOARDING_STEP_IDS = [
	"welcome",
	"provider",
	"godot_executable",
	"documentation",
	"godot_plugin",
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

export function createDefaultOnboardingPreferences(): OnboardingPreferences {
	return {
		schemaVersion: 1,
		completed: false,
		currentStep: "welcome",
		stepOutcomes: {},
		completedAt: null
	};
}

