import { installFlowTypePresentation } from "@/domain/flow/flow-value-presentation";
import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type {
	FlowDocument,
	FlowDocumentRun,
	FlowDocumentSnapshot,
	FlowNodeTypeDefinition,
	FlowToolDefinition,
	FlowApproval,
	FlowOperation,
	FlowPatchAck,
	FlowTreeOrder,
	FlowTreeOrderUpdate,
	FlowMediaArtifactRef,
	SessionMetadata,
} from "./types";

export type CreateFlowParams = {
	title: string;
	workspaceId?: string;
	provider?: string;
	model?: string;
	reasoningEffort?: string;
	chatMode?: import("./chat-api").ChatMode;
	approvalMode?: "manual" | "auto-safe" | "full-trust";
};

export async function createFlow(params: CreateFlowParams): Promise<FlowDocumentSnapshot> {
	return (await createBackendClient()).request("flow.create", params);
}

export async function fetchFlows(params: { workspaceId?: string; archived?: boolean } = {}): Promise<{ flows: FlowDocument[]; order?: FlowTreeOrder }> {
	return (await createBackendClient()).request("flow.list", params);
}

export async function fetchFlow(flowId: string): Promise<FlowDocumentSnapshot> {
	return (await createBackendClient()).request("flow.get", { flowId });
}

export async function renameFlow(flowId: string, title: string, revision: number): Promise<FlowDocument> {
	return (await createBackendClient()).request("flow.rename", { flowId, title, revision });
}

export async function archiveFlow(flowId: string, revision: number): Promise<FlowDocument> {
	return (await createBackendClient()).request("flow.archive", { flowId, revision });
}

export async function updateFlowTreeOrder(order: FlowTreeOrderUpdate): Promise<{ order: FlowTreeOrder; flows: FlowDocument[] }> {
	return (await createBackendClient()).request("flow.tree.order.update", order);
}

export async function moveFlowToWorkspace(flowId: string, workspaceId: string | null, revision: number): Promise<{ flow: FlowDocument; order: FlowTreeOrder }> {
	return (await createBackendClient()).request("flow.workspace.move", { flowId, workspaceId, revision });
}

export async function fetchFlowTreeOrder(): Promise<FlowTreeOrder> {
	return (await createBackendClient()).request("flow.tree.order.get", {});
}

export async function listFlowNodeTypes(params: { flowId?: string; workspaceId?: string } = {}): Promise<{ nodes: FlowNodeTypeDefinition[] }> {
	const result = await (await createBackendClient()).request<{ nodes: FlowNodeTypeDefinition[]; valueTypes?: Record<string, { color: string; control: string }> }>("flow.node.types.list", params);
	if (result.valueTypes) installFlowTypePresentation(result.valueTypes);
	return result;
}

export async function commitFlowPatch(params: { flowId: string; clientId: string; operations: FlowOperation[] }): Promise<FlowPatchAck> {
	return (await createBackendClient()).request("flow.patch.commit", { ...params, generation: "flow-parameters-2" });
}


export async function updateFlowSettings(params: { flowId: string; revision: number; approvalMode: FlowDocument["approvalMode"] }): Promise<FlowDocument> {
	return (await createBackendClient()).request("flow.settings.update", params);
}

export async function listFlowTools(flowId: string): Promise<{ tools: FlowToolDefinition[] }> {
	return (await createBackendClient()).request("flow.tools.list", { flowId });
}

export async function listFlowApprovals(flowId: string, runId?: string): Promise<{ approvals: FlowApproval[] }> {
	return (await createBackendClient()).request("flow.approval.list", { flowId, ...(runId === undefined ? {} : { runId }) });
}

export async function resolveFlowApproval(params: { flowId: string; runId: string; approvalId: string; decision: "approve" | "reject"; consentText?: string }): Promise<FlowDocumentRun> {
	return (await createBackendClient()).request("flow.approval.resolve", params);
}

export async function startFlowRun(params: {
	flowId: string;
	revision: number;
	forceNodeIds?: string[];
	forceAllSelected?: boolean;
	entryNodeIds?: string[];
	targetNodeIds?: string[];
	inputValues?: Record<string, unknown>;
}): Promise<FlowDocumentRun> {
	return (await createBackendClient()).request("flow.run.start", params);
}

export async function stopFlowRun(flowId: string, runId: string): Promise<FlowDocumentRun> {
	return (await createBackendClient()).request("flow.run.stop", { flowId, runId });
}

export async function retryFlowRun(params: { flowId: string; runId: string; nodeId?: string; confirmPossibleDuplicateCharge?: boolean }): Promise<FlowDocumentRun> {
	return (await createBackendClient()).request("flow.run.retry", params);
}

export async function importFlowFromSession(params: { sourceSessionId: string; title: string }): Promise<FlowDocumentSnapshot> {
	return (await createBackendClient()).request("flow.import.fromSession", params);
}

export async function exportFlowToSession(params: { flowId: string; outputNodeId: string; title: string }): Promise<{ metadata: SessionMetadata }> {
	return (await createBackendClient()).request("flow.export.toSession", params);
}

export async function listFlowArtifacts(flowId: string, runId?: string): Promise<{ artifacts: FlowMediaArtifactRef[] }> {
	return (await createBackendClient()).request("flow.artifact.list", { flowId, ...(runId === undefined ? {} : { runId }) });
}

export type FlowPreflightIssue = { code: string; nodeId: string | null; message: string };
export type FlowPreflightResult = { flowId: string; revision: number; blockers: FlowPreflightIssue[]; warnings: FlowPreflightIssue[]; plannedRequests: number | null };
export async function preflightFlowRun(params: { flowId: string; revision: number; entryNodeIds?: string[]; targetNodeIds?: string[]; inputValues?: Record<string, unknown> }): Promise<FlowPreflightResult> {
	return (await createBackendClient()).request("flow.run.preflight", params);
}

export type FlowRunReport = { flowId: string; runId: string; status: string; startedAt: string | null; finishedAt: string | null; nodes: Array<{ nodeId: string; typeId: string; status: string; startedAt: string | null; finishedAt: string | null; errorCode: string | null; events: Array<{ sequence: number; type: string; at: string; details: Record<string, string | number | boolean | null> }> }> };
export async function fetchFlowRunReport(flowId: string, runId: string): Promise<FlowRunReport> {
	return (await createBackendClient()).request("flow.run.report", { flowId, runId });
}

export async function fetchFlowArtifactUsage(flowId?: string): Promise<{ byteSize: number; freeBytes: number | null; warning: boolean; warningThresholdBytes: number }> {
	return (await createBackendClient()).request("flow.artifact.usage", flowId === undefined ? {} : { flowId });
}

export async function fetchFlowArtifactHealth(flowId?: string): Promise<{ checked: number; stagingFiles: number; issues: Array<{ artifactId: string; flowId: string; code: string }> }> {
	return (await createBackendClient()).request("flow.artifact.health", flowId === undefined ? {} : { flowId });
}

export async function importFlowInputArtifact(params: { flowId: string; nodeId: string; sourcePath: string; kind: "image" | "video" | "audio" | "mask" | "frames" | "artifact" }): Promise<{ ref: FlowMediaArtifactRef }> {
	return (await createBackendClient()).request("flow.artifact.import", params);
}

export async function listFlowGeneratedArtifacts(flowId: string, limit = 3): Promise<{ artifacts: FlowMediaArtifactRef[]; total: number }> {
	return (await createBackendClient()).request("flow.artifact.list", { flowId, aiGeneratedOnly: true, limit });
}

export async function getFlowArtifact(flowId: string, artifactId: string, includeData = false): Promise<{ ref: FlowMediaArtifactRef; dataBase64?: string }> {
	return (await createBackendClient()).request("flow.artifact.get", { flowId, artifactId, includeData });
}

export async function previewFlowArtifact(flowId: string, artifactId: string): Promise<{ ref: FlowMediaArtifactRef; dataBase64: string }> {
	return (await createBackendClient()).request("flow.artifact.preview", { flowId, artifactId });
}

export async function thumbnailFlowArtifact(flowId: string, artifactId: string): Promise<{ ref: FlowMediaArtifactRef; dataBase64: string }> {
	return (await createBackendClient()).request("flow.artifact.thumbnail", { flowId, artifactId });
}

export async function downloadFlowArtifact(flowId: string, artifactId: string): Promise<{ ref: FlowMediaArtifactRef; dataBase64: string }> {
	return (await createBackendClient()).request("flow.artifact.download", { flowId, artifactId });
}

export async function exportFlowArtifacts(params: { flowId: string; artifactIds: string[]; destinationPath: string; directory: boolean }): Promise<{ exportedPaths: string[] }> {
	return (await createBackendClient()).request("flow.artifact.export", params);
}

export type FlowCleanupPlan = { runs: Array<{ runId: string; status: string }>; artifacts: Array<{ artifactId: string; byteSize: number }>; removed: number };
export async function cleanupFlowArtifacts(params: { flowId: string; runIds: string[]; dryRun: boolean; expectedArtifactIds?: string[] }): Promise<FlowCleanupPlan> {
	return (await createBackendClient()).request("flow.artifact.cleanup", params);
}

export type FlowImportResult = { imported: true; flowId: string; title: string; workspaceId: string | null; archived: boolean; restoredArtifactCount: number; missingArtifactCount: number };
export async function importFlowData(sourcePath: string, operationId?: string): Promise<FlowImportResult> {
	return (await createBackendClient()).request("flow.import", { sourcePath, ...(operationId === undefined ? {} : { operationId }) });
}

export type FlowExportResult = { exported: true; flowId: string; destinationPath: string; byteSize: number; tableCounts: Record<string, number>; embeddedFileCount: number; missingFileCount: number };
export async function exportFlowData(flowId: string, destinationPath: string, operationId?: string): Promise<FlowExportResult> {
	return (await createBackendClient()).request("flow.export", { flowId, destinationPath, ...(operationId === undefined ? {} : { operationId }) });
}

export async function cancelFlowTransfer(operationId: string): Promise<{ cancelled: true }> {
	return (await createBackendClient()).request("flow.transfer.cancel", { operationId });
}
