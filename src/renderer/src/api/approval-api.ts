import { createBackendClient } from "./backend-client";

export type ApprovalMode = "manual" | "auto-safe";

export type ApprovalListResult = {
	pending: unknown[];
	mode: ApprovalMode;
};

export type SetApprovalModeResult = {
	mode: ApprovalMode;
	pendingApprovals: number;
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
