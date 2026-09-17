import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type {
	ConversationFlow,
	ConversationFlowSnapshot,
	ConversationFlowSummary,
	FlowDocument,
	FlowDocumentEdge,
	FlowDocumentNode,
	FlowDocumentNodeType,
	FlowDocumentRun,
	FlowDocumentSnapshot,
	FlowTreeOrder,
	FlowTreeOrderUpdate,
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

export async function fetchFlowTreeOrder(): Promise<FlowTreeOrder> {
	return (await createBackendClient()).request("flow.tree.order.get", {});
}

export async function createFlowNode(params: { flowId: string; revision: number; type: FlowDocumentNodeType; x: number; y: number; title?: string; config?: Record<string, unknown> }): Promise<FlowDocumentSnapshot> {
	return (await createBackendClient()).request("flow.node.create", params);
}

export async function updateFlowNode(params: { flowId: string; nodeId: string; revision: number; patch: Partial<Pick<FlowDocumentNode, "title" | "x" | "y" | "width" | "height" | "config">> }): Promise<FlowDocumentSnapshot> {
	return (await createBackendClient()).request("flow.node.update", params);
}

export async function deleteFlowNode(params: { flowId: string; nodeId: string; revision: number }): Promise<FlowDocumentSnapshot> {
	return (await createBackendClient()).request("flow.node.delete", params);
}

export async function createFlowEdge(params: { flowId: string; revision: number; sourceNodeId: string; sourcePort: string; targetNodeId: string; targetPort: string; dataType: FlowDocumentEdge["dataType"] }): Promise<FlowDocumentSnapshot> {
	return (await createBackendClient()).request("flow.edge.create", params);
}

export async function deleteFlowEdge(params: { flowId: string; edgeId: string; revision: number }): Promise<FlowDocumentSnapshot> {
	return (await createBackendClient()).request("flow.edge.delete", params);
}

export async function updateFlowViewport(params: { flowId: string; revision: number; viewport: FlowDocument["viewport"] }): Promise<FlowDocument> {
	return (await createBackendClient()).request("flow.viewport.update", params);
}

export async function startFlowRun(params: { flowId: string; revision: number; forceNodeIds?: string[] }): Promise<FlowDocumentRun> {
	return (await createBackendClient()).request("flow.run.start", params);
}

export async function stopFlowRun(flowId: string, runId: string): Promise<FlowDocumentRun> {
	return (await createBackendClient()).request("flow.run.stop", { flowId, runId });
}

export async function retryFlowRun(params: { flowId: string; runId: string; nodeId?: string }): Promise<FlowDocumentRun> {
	return (await createBackendClient()).request("flow.run.retry", params);
}

export async function importFlowFromSession(params: { sourceSessionId: string; title: string }): Promise<FlowDocumentSnapshot> {
	return (await createBackendClient()).request("flow.import.fromSession", params);
}

export async function exportFlowToSession(params: { flowId: string; outputNodeId: string; title: string }): Promise<{ metadata: SessionMetadata }> {
	return (await createBackendClient()).request("flow.export.toSession", params);
}

// Kept as type-only aliases for extensions that still import the former names.
export type CreateFlowBranchResult = never;
export type LegacyFlowTypes = { ConversationFlow: ConversationFlow; ConversationFlowSummary: ConversationFlowSummary; ConversationFlowSnapshot: ConversationFlowSnapshot };
