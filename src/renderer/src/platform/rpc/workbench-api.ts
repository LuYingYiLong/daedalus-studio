import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type {
	WorkbenchPatch,
	WorkbenchPatchResult,
	WorkbenchSnapshot,
} from "./types";

export type WorkbenchGetResult = {
	changed: boolean;
	workbench: WorkbenchSnapshot;
};

export async function fetchWorkbench(): Promise<WorkbenchSnapshot> {
	const client = await createBackendClient();
	const result = await client.request<WorkbenchGetResult>(
		"session.workbench.get",
	);

	return result.workbench;
}

export async function patchWorkbench(
	patch: WorkbenchPatch,
	beforeSend?: () => void,
): Promise<WorkbenchPatchResult> {
	const client = await createBackendClient();
	beforeSend?.();

	return client.request<WorkbenchPatchResult>(
		"session.workbench.patch",
		patch,
	);
}
