import { useState, type Dispatch, type SetStateAction } from "react";
import { useLatest } from "ahooks";
import type { ClientPreferences } from "@/platform/rpc/client-preferences-api";
import type { GeneralSettings } from "@/platform/rpc/general-settings-api";
import type { ProviderModelSelection } from "@/platform/rpc/provider-api";
import type { SlashCommandDefinition } from "@/platform/rpc/command-api";
import type { SkillSummary } from "@/platform/rpc/skill-api";
import type { BootstrapData } from "@/domain/application/bootstrap-data";
import useAppResourceBootstrapController from "./useAppResourceBootstrapController";
import useComposerResourceController from "@/features/composer/controllers/useComposerResourceController";

export type AppPreferencesController = {
	providerModelSelection: ProviderModelSelection | null;
	setProviderModelSelection: Dispatch<
		SetStateAction<ProviderModelSelection | null>
	>;
	slashCommands: SlashCommandDefinition[];
	setSlashCommands: Dispatch<SetStateAction<SlashCommandDefinition[]>>;
	skills: SkillSummary[];
	setSkills: Dispatch<SetStateAction<SkillSummary[]>>;
	loadSlashCommands: () => Promise<void>;
	loadSkills: (target?: { workspaceId?: string; sourceFolderId?: string }) => Promise<void>;
	handleCompletionOpen: (trigger: "/" | "@") => void;
	clientPreferences: ClientPreferences;
	setClientPreferences: Dispatch<SetStateAction<ClientPreferences>>;
	clientPreferencesRef: { current: ClientPreferences };
	generalSettings: GeneralSettings;
	setGeneralSettings: Dispatch<SetStateAction<GeneralSettings>>;
};

export type AppPreferencesControllerParams = {
	bootstrapData: BootstrapData;
	activeSessionId: string | null;
	workspaceId: string | null;
};

export default function useAppPreferencesController({
	bootstrapData,
	activeSessionId,
	workspaceId,
}: AppPreferencesControllerParams): AppPreferencesController {
	const [providerModelSelection, setProviderModelSelection] =
		useState<ProviderModelSelection | null>(
			bootstrapData.providerModelSelection,
		);
	const [slashCommands, setSlashCommands] = useState<
		SlashCommandDefinition[]
	>(() => bootstrapData.slashCommands);
	const [skills, setSkills] = useState<SkillSummary[]>(
		() => bootstrapData.skills,
	);
	const [clientPreferences, setClientPreferences] =
		useState<ClientPreferences>(bootstrapData.clientPreferences);
	const clientPreferencesRef = useLatest(clientPreferences);
	const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(
		bootstrapData.generalSettings,
	);

	useAppResourceBootstrapController({
		setClientPreferences,
		setGeneralSettings,
		setProviderModelSelection,
	});
	const {
		loadSlashCommands,
		loadSkills,
		handleCompletionOpen,
	} = useComposerResourceController({
		activeSessionId,
		workspaceId,
		slashCommands,
		skills,
		setSlashCommands,
		setSkills,
	});

	return {
		providerModelSelection,
		setProviderModelSelection,
		slashCommands,
		setSlashCommands,
		skills,
		setSkills,
		loadSlashCommands,
		loadSkills,
		handleCompletionOpen,
		clientPreferences,
		setClientPreferences,
		clientPreferencesRef,
		generalSettings,
		setGeneralSettings,
	};
}
