import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuProps } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { SessionMetadata, WorkspaceConfig } from "@/platform/rpc/types";
import type { WorkspaceLaunchTargetId } from "@/domain/workspace/workspace-launch";
import {
	DEFAULT_WORKSPACE_LAUNCH_TARGET_ID,
} from "@/domain/workspace/workspace-launch";
import { isWorkspaceLaunchTargetId } from "../layout/home-layout-model";

export type WorkspaceLaunchTarget = {
	id: WorkspaceLaunchTargetId;
	label: string;
};

const FALLBACK_WORKSPACE_LAUNCH_TARGETS: WorkspaceLaunchTarget[] = [
	{ id: "file-explorer", label: "File Explorer" },
	{ id: "terminal", label: "Terminal" },
];

export type HomePageLaunchControllerParams = {
	workspaceForActions: WorkspaceConfig | null;
	effectiveGodotLaunchExecutablePath: string | null;
	showWorkspaceLaunchControls: boolean;
	workspaceLaunchPreference: WorkspaceLaunchTargetId;
	activeSessionMetadata: SessionMetadata | null;
	onWorkspaceLaunchChange: (targetId: WorkspaceLaunchTargetId) => void;
	messageApi: MessageInstance;
};

export type HomePageLaunchController = {
	workspaceLaunchTargets: WorkspaceLaunchTarget[];
	selectedLaunchTarget: WorkspaceLaunchTarget;
	selectedLaunchTargetId: WorkspaceLaunchTargetId;
	workspaceLaunchMenuItems: MenuProps["items"];
	isOpeningLaunchTarget: boolean;
	handleWorkspaceLaunchMenuClick: NonNullable<MenuProps["onClick"]>;
	openWorkspaceLaunchTarget: (
		targetId: WorkspaceLaunchTargetId,
		options?: {
			godotRunMode?: "editor" | "project" | "scene";
			godotScenePath?: string;
		},
	) => Promise<void>;
};

export function getWorkspaceLaunchIcon(
	targetId: WorkspaceLaunchTargetId,
): React.ReactNode {
	if (targetId === "file-explorer") {
		return <Icon name="folder" />;
	}
	if (targetId === "terminal") {
		return <Icon name="terminal" />;
	}
	if (targetId === "git-bash") {
		return <Icon name="git-bash" />;
	}
	if (targetId === "godot") {
		return <Icon name="godot" />;
	}
	return <Icon name="external-link" />;
}

export default function useHomePageLaunchController({
	workspaceForActions,
	effectiveGodotLaunchExecutablePath,
	showWorkspaceLaunchControls,
	workspaceLaunchPreference,
	activeSessionMetadata,
	onWorkspaceLaunchChange,
	messageApi,
}: HomePageLaunchControllerParams): HomePageLaunchController {
	const { t } = useTranslation();
	const [workspaceLaunchTargets, setWorkspaceLaunchTargets] = useState<
		WorkspaceLaunchTarget[]
	>(FALLBACK_WORKSPACE_LAUNCH_TARGETS);
	const [selectedLaunchTargetId, setSelectedLaunchTargetId] =
		useState<WorkspaceLaunchTargetId>(workspaceLaunchPreference);
	const [isOpeningLaunchTarget, setIsOpeningLaunchTarget] =
		useState<boolean>(false);

	const selectedLaunchTarget: WorkspaceLaunchTarget =
		useMemo<WorkspaceLaunchTarget>(() => {
			return (
				workspaceLaunchTargets.find(
					(target: WorkspaceLaunchTarget): boolean =>
						target.id === selectedLaunchTargetId,
				) ??
				workspaceLaunchTargets[0] ??
				FALLBACK_WORKSPACE_LAUNCH_TARGETS[0]!
			);
		}, [selectedLaunchTargetId, workspaceLaunchTargets]);
	const workspaceLaunchMenuItems: MenuProps["items"] =
		useMemo<MenuProps["items"]>(() => {
			return workspaceLaunchTargets.map(
				(target: WorkspaceLaunchTarget) => {
					return {
						key: target.id,
						label: target.label,
						icon: getWorkspaceLaunchIcon(target.id),
					};
				},
			);
		}, [workspaceLaunchTargets]);

	useEffect((): (() => void) | void => {
		if (!showWorkspaceLaunchControls) {
			return;
		}

		let cancelled: boolean = false;
		window.electronAPI.workspaceFs
			.listLaunchTargets({
				godotExecutablePath: effectiveGodotLaunchExecutablePath,
			})
			.then((targets: WorkspaceLaunchTarget[]): void => {
				if (cancelled) {
					return;
				}

				const nextTargets: WorkspaceLaunchTarget[] =
					targets.length > 0
						? targets
						: FALLBACK_WORKSPACE_LAUNCH_TARGETS;
				const preferredTargetId: WorkspaceLaunchTargetId =
					workspaceLaunchPreference;
				const fallbackTargetId: WorkspaceLaunchTargetId =
					nextTargets.find(
						(target: WorkspaceLaunchTarget): boolean =>
							target.id === DEFAULT_WORKSPACE_LAUNCH_TARGET_ID,
					)?.id ?? DEFAULT_WORKSPACE_LAUNCH_TARGET_ID;
				const resolvedTargetId: WorkspaceLaunchTargetId =
					nextTargets.some(
						(target: WorkspaceLaunchTarget): boolean =>
							target.id === preferredTargetId,
					)
						? preferredTargetId
						: fallbackTargetId;
				setWorkspaceLaunchTargets(nextTargets);
				setSelectedLaunchTargetId(resolvedTargetId);
				if (
					activeSessionMetadata?.workspaceLaunch !== undefined &&
					activeSessionMetadata.workspaceLaunch !== resolvedTargetId
				) {
					onWorkspaceLaunchChange(resolvedTargetId);
				}
			})
			.catch((error: unknown): void => {
				console.error(
					"[HomePage] failed to list workspace launch targets",
					error,
				);
				if (!cancelled) {
					setWorkspaceLaunchTargets(
						FALLBACK_WORKSPACE_LAUNCH_TARGETS,
					);
					setSelectedLaunchTargetId(
						DEFAULT_WORKSPACE_LAUNCH_TARGET_ID,
					);
					if (
						activeSessionMetadata?.workspaceLaunch !== undefined &&
						activeSessionMetadata.workspaceLaunch !==
							DEFAULT_WORKSPACE_LAUNCH_TARGET_ID
					) {
						onWorkspaceLaunchChange(
							DEFAULT_WORKSPACE_LAUNCH_TARGET_ID,
						);
					}
				}
			});

		return (): void => {
			cancelled = true;
		};
	}, [
		activeSessionMetadata?.workspaceLaunch,
		effectiveGodotLaunchExecutablePath,
		onWorkspaceLaunchChange,
		showWorkspaceLaunchControls,
		workspaceLaunchPreference,
	]);

	const openWorkspaceLaunchTarget = useCallback(
		async (
			targetId: WorkspaceLaunchTargetId,
			options: {
				godotRunMode?: "editor" | "project" | "scene";
				godotScenePath?: string;
			} = {},
		): Promise<void> => {
			if (workspaceForActions === null) {
				return;
			}

			setSelectedLaunchTargetId(targetId);
			onWorkspaceLaunchChange(targetId);
			setIsOpeningLaunchTarget(true);
			try {
				await window.electronAPI.workspaceFs.openLaunchTarget({
					workspaceRoot: workspaceForActions.rootPath,
					targetId,
					godotExecutablePath:
						targetId === "godot"
							? effectiveGodotLaunchExecutablePath
							: undefined,
					godotRunMode:
						targetId === "godot" ? options.godotRunMode : undefined,
					godotScenePath:
						targetId === "godot" ? options.godotScenePath : undefined,
				});
			} catch (error: unknown) {
				const message: string =
					error instanceof Error
						? error.message
						: t("agentPage.workspaceLaunch.errors.open");
				console.error(
					"[HomePage] failed to open workspace launch target",
					error,
				);
				void messageApi.error(message);
			} finally {
				setIsOpeningLaunchTarget(false);
			}
		},
		[
			effectiveGodotLaunchExecutablePath,
			messageApi,
			onWorkspaceLaunchChange,
			t,
			workspaceForActions,
		],
	);

	const handleWorkspaceLaunchMenuClick: NonNullable<MenuProps["onClick"]> =
		useCallback(
			({ key }): void => {
				const targetId: string = String(key);
				if (!isWorkspaceLaunchTargetId(targetId)) {
					return;
				}
				void openWorkspaceLaunchTarget(targetId);
			},
			[openWorkspaceLaunchTarget],
		);

	return {
		workspaceLaunchTargets,
		selectedLaunchTarget,
		selectedLaunchTargetId,
		workspaceLaunchMenuItems,
		isOpeningLaunchTarget,
		handleWorkspaceLaunchMenuClick,
		openWorkspaceLaunchTarget,
	};
}
