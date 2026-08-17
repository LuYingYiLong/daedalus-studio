export type GeneralSettings = {
	schemaVersion: 3;
	nextStepHintsEnabled: boolean;
	godotExecutablePath: string | null;
	godotExecutableVersion: string | null;
	godotExecutableStatus: "unconfigured" | "ready" | "unavailable";
	godotExecutableError: string | null;
	updatedAt: string;
};
