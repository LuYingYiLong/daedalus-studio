import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import { fetchClientPreferences, type ClientPreferences } from "@/platform/rpc/client-preferences-api";
import { fetchGeneralSettings, type GeneralSettings } from "@/platform/rpc/general-settings-api";
import { fetchProviderModelSelection, type ProviderModelSelection } from "@/platform/rpc/provider-api";
import {
	fetchWorkspaces,
	fetchWorkspaceTreeOrder,
	type WorkspaceTreeOrderPreferences
} from "@/platform/rpc/workspace-api";
import { fetchSessions } from "@/platform/rpc/session-api";
import { fetchSlashCommands, type SlashCommandDefinition } from "@/platform/rpc/command-api";
import { fetchSkills, type SkillSummary } from "@/platform/rpc/skill-api";
import type { SessionListResult, WorkspaceListResult } from "@/platform/rpc/types";
import type { BackendHealthResult } from "@/platform/rpc/bootstrap-api";
import type { BootstrapData } from "@/domain/application/bootstrap-data";
import type { SessionLayoutMap } from "@/domain/session/session-layout";

export type { BackendHealthResult } from "@/platform/rpc/bootstrap-api";
export type { BootstrapData } from "@/domain/application/bootstrap-data";

type InitialSettingsData = Pick<BootstrapData,
	"clientPreferences"
	| "generalSettings"
	| "providerModelSelection"
>;

export type BootstrapProgress = {
	label: string;
	percent: number;
};

export type BootstrapTranslator = (key: string, options?: Record<string, unknown>) => string;

const BACKEND_READY_TIMEOUT_MS: number = 30000;
const BACKEND_READY_POLL_MS: number = 500;
const BOOTSTRAP_RESOURCE_TIMEOUT_MS: number = 20000;

function delay(ms: number): Promise<void> {
	return new Promise((resolve): void => {
		window.setTimeout(resolve, ms);
	});
}

async function withBootstrapTimeout<TResult>(
	resourceName: string,
	task: Promise<TResult>,
	t: BootstrapTranslator
): Promise<TResult> {
	let timeoutId: number | null = null;
	const timeoutTask = new Promise<never>((_resolve, reject): void => {
	timeoutId = window.setTimeout((): void => {
			reject(new Error(t("app.boot.error.resourceTimeout", { resource: resourceName })));
		}, BOOTSTRAP_RESOURCE_TIMEOUT_MS);
	});
	try {
		return await Promise.race([task, timeoutTask]);
	} finally {
		if (timeoutId !== null) {
			window.clearTimeout(timeoutId);
		}
	}
}

async function waitForBackendReady(
	onProgress: (progress: BootstrapProgress) => void,
	t: BootstrapTranslator
): Promise<void> {
	const deadline: number = Date.now() + BACKEND_READY_TIMEOUT_MS;
	onProgress({ label: t("app.boot.progress.startingBackend"), percent: 10 });
	while (Date.now() < deadline) {
		if (await window.electronAPI.backend.healthCheck()) {
			return;
		}
		await delay(BACKEND_READY_POLL_MS);
	}
	throw new Error(t("app.boot.error.backendReadyTimeout"));
}

async function loadInitialSettingsData(
	onProgress: (progress: BootstrapProgress) => void,
	t: BootstrapTranslator
): Promise<InitialSettingsData> {
	onProgress({ label: t("app.boot.progress.loadingPreferences"), percent: 40 });
	const [clientPreferences, generalSettings, providerModelSelection]: [ClientPreferences, GeneralSettings, ProviderModelSelection] = await Promise.all([
		withBootstrapTimeout(t("app.boot.resources.clientPreferences"), fetchClientPreferences(), t),
		withBootstrapTimeout(t("app.boot.resources.generalSettings"), fetchGeneralSettings(), t),
		withBootstrapTimeout(t("app.boot.resources.providerModels"), fetchProviderModelSelection(), t)
	]);
	return {
		clientPreferences,
		generalSettings,
		providerModelSelection
	};
}

export async function loadBootstrapData(
	onProgress: (progress: BootstrapProgress) => void,
	t: BootstrapTranslator
): Promise<BootstrapData> {
	await waitForBackendReady(onProgress, t);

	onProgress({ label: t("app.boot.progress.connectingBackend"), percent: 25 });
	const client = await createBackendClient();
	const backendHealth: BackendHealthResult = await withBootstrapTimeout(
		t("app.boot.resources.backendHealth"),
		client.request<BackendHealthResult>("backend.health"),
		t
	);

	const settingsData: InitialSettingsData = await loadInitialSettingsData(onProgress, t);

	onProgress({ label: t("app.boot.progress.loadingWorkspaceData"), percent: 60 });
	const [workspaceList, sessionList, sessionLayouts, workspaceTreeOrder]: [
		WorkspaceListResult,
		SessionListResult,
		SessionLayoutMap,
		WorkspaceTreeOrderPreferences
	] = await Promise.all([
		withBootstrapTimeout(t("app.boot.resources.workspaces"), fetchWorkspaces(), t),
		withBootstrapTimeout(t("app.boot.resources.sessions"), fetchSessions(), t),
		withBootstrapTimeout(t("app.boot.resources.sessionLayouts"), window.electronAPI.sessionLayout.getAll(), t),
		withBootstrapTimeout(t("app.boot.resources.workspaceTreeOrder"), fetchWorkspaceTreeOrder(), t)
	]);

	onProgress({ label: t("app.boot.progress.loadingCommandsAndSkills"), percent: 85 });
	const [slashCommands, skillList] = await Promise.all([
		withBootstrapTimeout(t("app.boot.resources.slashCommands"), fetchSlashCommands(), t),
		withBootstrapTimeout(t("app.boot.resources.skills"), fetchSkills(), t)
	]);

	onProgress({ label: t("app.boot.progress.ready"), percent: 100 });
	return {
		backendHealth,
		...settingsData,
		workspaceList,
		sessionList,
		sessionLayouts,
		workspaceTreeOrder,
		slashCommands,
		skills: skillList.skills
	};
}
