import { createBackendClient } from "./transport/backend-client";
import type { EnvironmentTrustStatus, LocalEnvironmentConfigDocument, WorkspaceConfig } from "./types";

export async function getEnvironmentConfig(workspaceId: string, sourceFolderId: string): Promise<LocalEnvironmentConfigDocument> {
	return (await createBackendClient()).request("environment.config.get", { workspaceId, sourceFolderId });
}

export async function updateEnvironmentConfig(params: { workspaceId: string; sourceFolderId: string; content: string; expectedRevision: string }): Promise<LocalEnvironmentConfigDocument> {
	return (await createBackendClient()).request("environment.config.update", params);
}

export async function updateEnvironmentTrust(params: { workspaceId: string; sourceFolderId: string; fingerprint: string; status: Exclude<EnvironmentTrustStatus, "review-required"> }): Promise<LocalEnvironmentConfigDocument> {
	return (await createBackendClient()).request("environment.trust.update", params);
}

export async function listEnvironmentActions(params: { workspaceId: string; sourceFolderId: string; environmentId?: string }): Promise<Array<{ id: string; name: string; icon?: string; script: string; network?: boolean; fingerprint: string; trust: EnvironmentTrustStatus }>> {
	return (await createBackendClient()).request("environment.actions.list", params);
}

export async function listWorktreeStatuses(): Promise<{
	sessions: Array<{ session: { id: string; title: string; worktree?: unknown }; health: WorktreeHealthSnapshot }>;
	permanent: Array<{ workspace: WorkspaceConfig; health: WorktreeHealthSnapshot }>;
	orphans: string[];
	operations: Array<{ id: string; type: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted"; stage: string; progress: number; message?: string; error?: { code: string; message: string }; updatedAt: string }>;
}> {
	return (await createBackendClient()).request("workspace.worktree.status.list", {});
}

export type WorktreeHealthSnapshot = {
	worktreeId: string;
	status: "healthy" | "unavailable" | "recovery-required";
	issues: Array<{ code: string; message: string; sourceFolderId?: string }>;
	diskBytes: number;
	checkedAt: string;
};

export async function repairWorktree(sessionId: string): Promise<WorktreeHealthSnapshot> {
	return (await createBackendClient()).request("workspace.worktree.repair", { sessionId });
}

export async function createPermanentWorktree(params: { workspaceId: string; name: string; sources?: Record<string, { startingState?: import("./types").WorktreeStartingState; environmentId?: string | null; environmentFingerprint?: string | null }> }): Promise<{ workspace: WorkspaceConfig }> {
	return (await createBackendClient()).request("workspace.worktree.permanent.create", params);
}

export async function deletePermanentWorktree(workspaceId: string): Promise<{ deleted: true; workspaceId: string }> {
	return (await createBackendClient()).request("workspace.worktree.permanent.delete", { workspaceId });
}
