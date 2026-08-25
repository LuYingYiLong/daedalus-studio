export type GeneralSettings = {
	schemaVersion: 4;
	nextStepHintsEnabled: boolean;
	autoCompactActivityDetails: boolean;
	godotExecutablePath: string | null;
	godotExecutableVersion: string | null;
	godotExecutableStatus: "unconfigured" | "ready" | "unavailable";
	godotExecutableError: string | null;
	updatedAt: string;
};
