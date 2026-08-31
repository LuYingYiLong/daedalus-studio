import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
	fetchSlashCommands,
	type SlashCommandDefinition,
} from "@/platform/rpc/command-api";
import { fetchSkills, type SkillSummary, type SkillTarget } from "@/platform/rpc/skill-api";
import type { ComposerCompletionTrigger } from "@/domain/composer/composer-completion";

export type ComposerResourceControllerParams = {
	activeSessionId: string | null;
	workspaceId: string | null;
	slashCommands: readonly SlashCommandDefinition[];
	skills: readonly SkillSummary[];
	setSlashCommands: Dispatch<SetStateAction<SlashCommandDefinition[]>>;
	setSkills: Dispatch<SetStateAction<SkillSummary[]>>;
};

export type ComposerResourceController = {
	loadSlashCommands: () => Promise<void>;
	loadSkills: (target?: SkillTarget) => Promise<void>;
	handleCompletionOpen: (trigger: ComposerCompletionTrigger) => void;
};

export default function useComposerResourceController({
	activeSessionId,
	workspaceId,
	slashCommands,
	skills,
	setSlashCommands,
	setSkills,
}: ComposerResourceControllerParams): ComposerResourceController {
	const slashCommandsLoadingRef = useRef<boolean>(false);
	const skillsLoadingTargetKeyRef = useRef<string | null>(null);
	const skillsLoadVersionRef = useRef<number>(0);
	const skillTargetRef = useRef<SkillTarget>({});
	const slashCommandsRetryAtRef = useRef<number>(0);
	const skillsRetryAtRef = useRef<number>(0);
	const skillsRetryTargetKeyRef = useRef<string | null>(null);

	const loadSlashCommands = useCallback(async (): Promise<void> => {
		if (
			slashCommandsLoadingRef.current ||
			Date.now() < slashCommandsRetryAtRef.current
		) {
			return;
		}

		slashCommandsLoadingRef.current = true;
		try {
			setSlashCommands(await fetchSlashCommands());
			slashCommandsRetryAtRef.current = 0;
		} catch (error: unknown) {
			slashCommandsRetryAtRef.current = Date.now() + 3000;
			console.error("[App] load slash commands failed", error);
		} finally {
			slashCommandsLoadingRef.current = false;
		}
	}, [setSlashCommands]);

	const loadSkills = useCallback(
		async (target: SkillTarget = skillTargetRef.current): Promise<void> => {
			const targetKey: string = `${target.workspaceId ?? "global"}\u0000${target.sourceFolderId ?? "all"}`;
			if (
				skillsLoadingTargetKeyRef.current === targetKey ||
				(skillsRetryTargetKeyRef.current === targetKey &&
					Date.now() < skillsRetryAtRef.current)
			) {
				return;
			}

			const loadVersion: number = skillsLoadVersionRef.current + 1;
			skillsLoadVersionRef.current = loadVersion;
			skillsLoadingTargetKeyRef.current = targetKey;
			try {
				const result = await fetchSkills(target);
				if (skillsLoadVersionRef.current !== loadVersion) {
					return;
				}
				setSkills(result.skills);
				skillsRetryAtRef.current = 0;
				skillsRetryTargetKeyRef.current = null;
			} catch (error: unknown) {
				if (skillsLoadVersionRef.current !== loadVersion) {
					return;
				}
				setSkills([]);
				skillsRetryAtRef.current = Date.now() + 3000;
				skillsRetryTargetKeyRef.current = targetKey;
				console.error("[App] load skills failed", error);
			} finally {
				if (skillsLoadVersionRef.current === loadVersion) {
					skillsLoadingTargetKeyRef.current = null;
				}
			}
		},
		[setSkills],
	);

	const handleCompletionOpen = useCallback(
		(trigger: ComposerCompletionTrigger): void => {
			if (trigger === "/" && slashCommands.length === 0) {
				void loadSlashCommands();
			}

			if (trigger === "@" && skills.length === 0) {
				void loadSkills();
			}
		},
		[loadSkills, loadSlashCommands, skills.length, slashCommands.length],
	);

	useEffect((): void => {
		void loadSlashCommands();
	}, [loadSlashCommands]);

	useEffect((): void => {
		skillTargetRef.current =
			workspaceId === null ? {} : { workspaceId };
		if (activeSessionId === null && workspaceId === null) {
			setSkills([]);
			return;
		}

		void loadSkills(skillTargetRef.current);
	}, [activeSessionId, loadSkills, setSkills, workspaceId]);

	return {
		loadSlashCommands,
		loadSkills,
		handleCompletionOpen,
	};
}
