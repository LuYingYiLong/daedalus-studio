import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type {
	ConversationFlow,
	ConversationFlowBranch,
	ConversationFlowNode,
	ConversationFlowNodePosition,
	ConversationFlowSnapshot,
	ConversationFlowSummary,
	SessionMetadata,
} from "./types";
import type { ChatMode } from "./chat-api";

export type CreateFlowParams = {
	title: string;
	workspaceId?: string;
	provider?: string;
	model?: string;
	reasoningEffort?: string;
	chatMode?: ChatMode;
	approvalMode?: "manual" | "auto-safe" | "full-trust";
};

export type CreateFlowBranchResult = {
	branch: ConversationFlowBranch;
	session: SessionMetadata;
	seedAction: "regenerate" | "compose";
	draft: { text: string; additionalContext: import("./types").AdditionalContextItem[] };
	flow: ConversationFlowSnapshot;
};

export async function createFlow(params: CreateFlowParams): Promise<ConversationFlowSnapshot> {
	return (await createBackendClient()).request("flow.create", params);
}

export async function createFlowFromSession(params: {
	sourceSessionId: string;
	title: string;
}): Promise<ConversationFlowSnapshot> {
	return (await createBackendClient()).request("flow.create.fromSession", params);
}

export async function fetchFlows(params: {
	workspaceId?: string;
	archived?: boolean;
} = {}): Promise<{ flows: ConversationFlowSummary[] }> {
	return (await createBackendClient()).request("flow.list", params);
}

export async function fetchFlow(flowId: string): Promise<ConversationFlowSnapshot> {
	return (await createBackendClient()).request("flow.get", { flowId });
}

export async function fetchFlowNode(flowId: string, nodeId: string): Promise<{
	node: ConversationFlowNode;
	block: unknown;
}> {
	return (await createBackendClient()).request("flow.node.get", { flowId, nodeId });
}

export async function renameFlow(flowId: string, title: string, revision: number): Promise<ConversationFlow> {
	return (await createBackendClient()).request("flow.rename", { flowId, title, revision });
}

export async function archiveFlow(flowId: string, revision: number): Promise<ConversationFlow> {
	return (await createBackendClient()).request("flow.archive", { flowId, revision });
}

export async function createFlowBranch(params: {
	flowId: string;
	parentBranchId: string;
	sourceNodeId: string;
	title?: string;
}): Promise<CreateFlowBranchResult> {
	return (await createBackendClient()).request("flow.branch.create", params);
}

export async function copyFlowBranchToChat(params: {
	flowId: string;
	branchId: string;
	title: string;
}): Promise<{ metadata: SessionMetadata; draft: { text: string } }> {
	return (await createBackendClient()).request("flow.branch.copyToChat", params);
}

export async function updateFlowLayout(
	flowId: string,
	revision: number,
	positions: ConversationFlowNodePosition[],
): Promise<ConversationFlow> {
	return (await createBackendClient()).request("flow.layout.update", { flowId, revision, positions });
}
