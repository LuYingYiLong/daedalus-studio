import { createBackendClient } from "./backend-client";
import type { WorkbenchPatch, WorkbenchPatchResult, WorkbenchSnapshot } from "./types";

export type WorkbenchGetResult = {
	changed: boolean;
	workbench: WorkbenchSnapshot;
};

export async function fetchWorkbench(): Promise<WorkbenchSnapshot> {
	const client = await createBackendClient();
	const result = await client.request<WorkbenchGetResult>("session.workbench.get");

	return result.workbench;
}

export async function patchWorkbench(patch: WorkbenchPatch): Promise<WorkbenchPatchResult> {
	const client = await createBackendClient();

	return client.request<WorkbenchPatchResult>("session.workbench.patch", patch);
}
