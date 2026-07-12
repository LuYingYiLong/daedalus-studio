import { createBackendClient } from "./backend-client";

export type ApprovalMode = "manual" | "auto-safe";

export type PendingApprovalStatus = "pending" | "interrupted";

export type PendingApproval = {
	approvalId: string;
	toolCallId: string;
	toolName: string;
	llmToolName: string;
	reason: string;
	args: Record<string, unknown>;
	status: PendingApprovalStatus;
	restored: boolean;
	interrupted: boolean;
	requestId: string;
	createdAt: string;
	updatedAt: string;
	executionFingerprint?: string;
	workspaceId?: string;
	editorInstanceId?: string;
	lastError?: string;
};

export type ApprovalListResult = {
	pending: PendingApproval[];
	mode: ApprovalMode;
};

export type SetApprovalModeResult = {
	mode: ApprovalMode;
	pendingApprovals: number;
};

export type ApprovalExecutionResult = {
	content: string;
	cached?: boolean;
};

export type ApproveApprovalResult = {
	approved: true;
	approvalId: string;
	result: ApprovalExecutionResult;
	continued: boolean;
};

export type RejectApprovalResult = {
	rejected: true;
	approvalId: string;
	toolName: string;
};

export async function fetchApprovalList(): Promise<ApprovalListResult> {
	const client = await createBackendClient();

	return client.request<ApprovalListResult>("approval.list");
}

export async function setApprovalMode(mode: ApprovalMode): Promise<SetApprovalModeResult> {
	const client = await createBackendClient();

	return client.request<SetApprovalModeResult>("approval.mode.set", {
		mode
	});
}

export async function approveApproval(approvalId: string): Promise<ApproveApprovalResult> {
	const client = await createBackendClient();

	return client.request<ApproveApprovalResult>("approval.approve", {
		approvalId
	});
}

export async function rejectApproval(approvalId: string): Promise<RejectApprovalResult> {
	const client = await createBackendClient();

	return client.request<RejectApprovalResult>("approval.reject", {
		approvalId
	});
}
