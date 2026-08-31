import type { ChatMode } from "@/platform/rpc/chat-api";
import type { WorktreeStartingState, WorkspaceConfig } from "@/platform/rpc/types";
import type { WorkspaceLaunchTargetId } from "@/domain/workspace/workspace-launch";

export type HomeDraft = {
	workspaceId: string | null;
	workspace: WorkspaceConfig | null;
	chatMode: ChatMode;
	providerId: string | null;
	modelId: string | null;
	reasoningEffort: string;
	workspaceLaunch: WorkspaceLaunchTargetId;
	executionEnvironment: "local" | "worktree";
	worktreeSources: Record<string, {
		startingState?: WorktreeStartingState;
		environmentId?: string | null;
		environmentFingerprint?: string | null;
	}>;
};
