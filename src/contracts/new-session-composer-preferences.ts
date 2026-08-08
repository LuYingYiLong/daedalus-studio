export type NewSessionChatMode = "ask" | "agent" | "plan" | "goal";

export type NewSessionApprovalMode = "manual" | "auto-safe" | "full-trust";

export type NewSessionComposerModel = {
	providerId: string;
	modelId: string;
};

export type NewSessionComposerPreferences = {
	mode: NewSessionChatMode;
	approvalMode: NewSessionApprovalMode;
	model: NewSessionComposerModel | null;
	reasoningEffort: string;
};

export const DEFAULT_NEW_SESSION_COMPOSER_PREFERENCES: NewSessionComposerPreferences = {
	mode: "agent",
	approvalMode: "manual",
	model: null,
	reasoningEffort: "medium"
};

export function createDefaultNewSessionComposerPreferences(): NewSessionComposerPreferences {
	return {
		...DEFAULT_NEW_SESSION_COMPOSER_PREFERENCES,
		model: null
	};
}
