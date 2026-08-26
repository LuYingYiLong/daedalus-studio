export type GeneralSettings = {
	schemaVersion: 5;
	nextStepHintsEnabled: boolean;
	autoCompactActivityDetails: boolean;
	developerMode: boolean;
	godotExecutablePath: string | null;
	godotExecutableVersion: string | null;
	godotExecutableStatus: "unconfigured" | "ready" | "unavailable";
	godotExecutableError: string | null;
	updatedAt: string;
};
