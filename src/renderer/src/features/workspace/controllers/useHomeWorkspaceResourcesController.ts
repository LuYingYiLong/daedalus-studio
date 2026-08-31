import {
	useCallback,
	useEffect,
	useState,
	type Dispatch,
	type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { workspaceSupportsWorktrees } from "@/domain/workspace/worktree-capability";
import {
	fetchWorkspaces,
	getWorktreeEligibility,
	type WorktreeEligibilityResult,
	type WorktreeEligibilitySource,
} from "@/platform/rpc/workspace-api";
import type { WorkspaceConfig } from "@/platform/rpc/types";

export type HomeWorkspaceResourcesControllerParams = {
	isNewSessionHome: boolean;
	activeSessionId: string | null;
	workspaceId: string | null;
	workspace: WorkspaceConfig | null;
	workspaceRefreshToken: number;
	setHomeWorkspaceOptions: Dispatch<SetStateAction<WorkspaceConfig[]>>;
};

export type HomeWorkspaceResourcesController = {
	loadHomeWorkspaces: () => Promise<void>;
	worktreeDisabledReason: string | null;
};

export function resolveWorktreeDisabledReason(
	result: WorktreeEligibilityResult,
	getUnavailableMessage: () => string,
	getReasonMessage: (reasonCode: string, fallback: string) => string,
): string | null {
	if (result.eligible) {
		return null;
	}

	const unavailableSource: WorktreeEligibilitySource | undefined =
		result.sources.find(
			(source: WorktreeEligibilitySource): boolean => !source.eligible,
		);
	const fallbackMessage: string =
		unavailableSource?.reason ?? getUnavailableMessage();
	if (
		unavailableSource?.reasonCode === null ||
		unavailableSource?.reasonCode === undefined
	) {
		return fallbackMessage;
	}

	return getReasonMessage(unavailableSource.reasonCode, fallbackMessage);
}

export default function useHomeWorkspaceResourcesController({
	isNewSessionHome,
	activeSessionId,
	workspaceId,
	workspace,
	workspaceRefreshToken,
	setHomeWorkspaceOptions,
}: HomeWorkspaceResourcesControllerParams): HomeWorkspaceResourcesController {
	const { t } = useTranslation();
	const [worktreeDisabledReason, setWorktreeDisabledReason] = useState<
		string | null
	>(null);

	const getUnavailableMessage = useCallback(
		(): string => t("composer.worktree.unavailable"),
		[t],
	);
	const getReasonMessage = useCallback(
		(reasonCode: string, fallback: string): string =>
			t(`composer.worktree.reasons.${reasonCode}`, {
				defaultValue: fallback,
			}),
		[t],
	);

	const loadHomeWorkspaces = useCallback(async (): Promise<void> => {
		try {
			const result = await fetchWorkspaces();
			setHomeWorkspaceOptions(result.workspaces);
		} catch (error: unknown) {
			console.error("[App] load home workspaces failed", error);
		}
	}, [setHomeWorkspaceOptions]);

	useEffect((): void => {
		if (!isNewSessionHome || activeSessionId !== null) {
			return;
		}
		void loadHomeWorkspaces();
	}, [
		activeSessionId,
		isNewSessionHome,
		loadHomeWorkspaces,
		workspaceRefreshToken,
	]);

	useEffect((): (() => void) | void => {
		if (!isNewSessionHome || workspaceId === null) {
			setWorktreeDisabledReason(null);
			return;
		}
		if (
			workspace !== null &&
			workspace.id === workspaceId &&
			!workspaceSupportsWorktrees(workspace)
		) {
			setWorktreeDisabledReason(getUnavailableMessage());
			return;
		}

		let cancelled: boolean = false;
		setWorktreeDisabledReason(null);
		void getWorktreeEligibility(workspaceId)
			.then((result: WorktreeEligibilityResult): void => {
				if (cancelled) {
					return;
				}
				setWorktreeDisabledReason(
					resolveWorktreeDisabledReason(
						result,
						getUnavailableMessage,
						getReasonMessage,
					),
				);
			})
			.catch((error: unknown): void => {
				if (!cancelled) {
					setWorktreeDisabledReason(
						error instanceof Error
							? error.message
							: getUnavailableMessage(),
					);
				}
			});

		return (): void => {
			cancelled = true;
		};
	}, [
		getReasonMessage,
		getUnavailableMessage,
		isNewSessionHome,
		workspace,
		workspaceId,
	]);

	return {
		loadHomeWorkspaces,
		worktreeDisabledReason,
	};
}
