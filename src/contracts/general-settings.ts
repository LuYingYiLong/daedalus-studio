export type GeneralSettings = {
	schemaVersion: 2;
	nextStepHintsEnabled: boolean;
	fontFamily: string;
	fontFamilyCode: string;
	godotExecutablePath: string | null;
	godotExecutableVersion: string | null;
	godotExecutableStatus: "unconfigured" | "ready" | "unavailable";
	godotExecutableError: string | null;
	updatedAt: string;
};
