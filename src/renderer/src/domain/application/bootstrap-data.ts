import type { ClientPreferences } from "@/platform/rpc/client-preferences-api";
import type { SlashCommandDefinition } from "@/platform/rpc/command-api";
import type { GeneralSettings } from "@/platform/rpc/general-settings-api";
import type { ProviderModelSelection } from "@/platform/rpc/provider-api";
import type { SessionListResult, WorkspaceListResult } from "@/platform/rpc/types";
import type { SkillSummary } from "@/platform/rpc/skill-api";
import type { WorkspaceTreeOrderPreferences } from "@/platform/rpc/workspace-api";
import type { BackendHealthResult } from "@/platform/rpc/bootstrap-api";
import type { SessionLayoutMap } from "@/domain/session/session-layout";

export type BootstrapData = {
	backendHealth: BackendHealthResult;
	clientPreferences: ClientPreferences;
	generalSettings: GeneralSettings;
	providerModelSelection: ProviderModelSelection;
	workspaceList: WorkspaceListResult;
	sessionList: SessionListResult;
	slashCommands: SlashCommandDefinition[];
	skills: SkillSummary[];
	sessionLayouts: SessionLayoutMap;
	workspaceTreeOrder: WorkspaceTreeOrderPreferences;
};
