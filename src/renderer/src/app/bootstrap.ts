import { createBackendClient } from "@/api/backend-client";
import { fetchClientPreferences, type ClientPreferences } from "@/api/client-preferences-api";
import { fetchGeneralSettings, type GeneralSettings } from "@/api/general-settings-api";
import { fetchProviderModelSelection, type ProviderModelSelection } from "@/api/provider-api";
import { fetchWorkspaces } from "@/api/workspace-api";
import { fetchSessions } from "@/api/session-api";
import { fetchSlashCommands, type SlashCommandDefinition } from "@/api/command-api";
import { fetchSkills, type SkillSummary } from "@/api/skill-api";
import type { SessionListResult, WorkspaceListResult } from "@/api/types";

export type BackendHealthResult = {
	name: string;
	version: string;
	pid: number;
	mode: string;
	port: number;
	multiClient: {
		enabled: boolean;
		protocolVersion: number;
	};
	logPath: string | null;
};

export type BootstrapData = {
	backendHealth: BackendHealthResult;
	clientPreferences: ClientPreferences;
	generalSettings: GeneralSettings;
	providerModelSelection: ProviderModelSelection;
	workspaceList: WorkspaceListResult;
	sessionList: SessionListResult;
	slashCommands: SlashCommandDefinition[];
	skills: SkillSummary[];
};

export type BootstrapProgress = {
	label: string;
	percent: number;
};

const BACKEND_READY_TIMEOUT_MS: number = 30000;
const BACKEND_READY_POLL_MS: number = 500;

function delay(ms: number): Promise<void> {
	return new Promise((resolve): void => {
		window.setTimeout(resolve, ms);
	});
}

async function waitForBackendReady(onProgress: (progress: BootstrapProgress) => void): Promise<void> {
	const deadline: number = Date.now() + BACKEND_READY_TIMEOUT_MS;
	onProgress({ label: "Starting backend", percent: 10 });
	while (Date.now() < deadline) {
		if (await window.electronAPI.backend.healthCheck()) {
			return;
		}
		await delay(BACKEND_READY_POLL_MS);
	}
	throw new Error("Backend did not become ready in time.");
}

export async function loadBootstrapData(onProgress: (progress: BootstrapProgress) => void): Promise<BootstrapData> {
	await waitForBackendReady(onProgress);

	onProgress({ label: "Connecting backend", percent: 25 });
	const client = await createBackendClient();
	const backendHealth: BackendHealthResult = await client.request<BackendHealthResult>("backend.health");

	onProgress({ label: "Loading preferences", percent: 40 });
	const [clientPreferences, generalSettings]: [ClientPreferences, GeneralSettings] = await Promise.all([
		fetchClientPreferences(),
		fetchGeneralSettings()
	]);

	onProgress({ label: "Loading workspace data", percent: 60 });
	const [providerModelSelection, workspaceList, sessionList]: [ProviderModelSelection, WorkspaceListResult, SessionListResult] = await Promise.all([
		fetchProviderModelSelection(),
		fetchWorkspaces(),
		fetchSessions()
	]);

	onProgress({ label: "Loading commands and skills", percent: 85 });
	const [slashCommands, skillList] = await Promise.all([
		fetchSlashCommands(),
		fetchSkills()
	]);

	onProgress({ label: "Ready", percent: 100 });
	return {
		backendHealth,
		clientPreferences,
		generalSettings,
		providerModelSelection,
		workspaceList,
		sessionList,
		slashCommands,
		skills: skillList.skills
	};
}
