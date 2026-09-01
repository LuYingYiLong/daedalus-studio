import { createBackendClient } from "@/platform/rpc/transport/backend-client";

export type GodotRuntimeTestSession = {
	testSessionId: string;
	workspaceId: string;
	workspaceRoot: string;
	runtimeInstanceId: string | null;
	online: boolean;
	createdAt: string;
	expiresAt: string;
	lastHeartbeatAt: string | null;
	treeRevision: number | null;
	scenePath: string | null;
};

export type GodotRuntimeTestSessionToken = GodotRuntimeTestSession & {
	token: string;
};

export type GodotRuntimeNode = {
	nodeId: string;
	type: string;
	name: string;
	nodePath: string;
	visible: boolean;
	visibleInTree: boolean;
	enabled: boolean;
	globalRect: { x: number; y: number; width: number; height: number };
	text: string;
	supportedActions: string[];
	properties: Record<string, unknown>;
};

export type GodotRuntimeObservation = {
	ok: true;
	runtimeInstanceId: string;
	observationId: string;
	treeRevision: number;
	scenePath: string;
	rootName: string;
	nodes: GodotRuntimeNode[];
	nodeCount: number;
	truncated: boolean;
	capturedAtMsec: number;
};

export type GodotRuntimeToolResult = Record<string, unknown> & {
	ok?: boolean;
	status?: "not_dispatched" | "dispatched" | "unknown" | "completed" | "failed";
	error?: string;
};

type McpContent =
	| { type: "text"; text: string }
	| { type: "image"; data: string; mimeType: string };

type McpCallResult = { content: McpContent[] };

export async function createGodotRuntimeTestSession(params: {
	workspaceId: string;
	sourceFolderId: string;
}): Promise<GodotRuntimeTestSessionToken> {
	return (await createBackendClient()).request("godot.runtimeTest.create", params);
}

export async function listGodotRuntimeTestSessions(
	workspaceId: string,
): Promise<GodotRuntimeTestSession[]> {
	const result = await (await createBackendClient()).request<{ sessions: GodotRuntimeTestSession[] }>(
		"godot.runtimeTest.status",
		{ workspaceId },
	);
	return result.sessions;
}

export async function stopGodotRuntimeTestSession(testSessionId: string): Promise<boolean> {
	const result = await (await createBackendClient()).request<{ stopped: boolean }>(
		"godot.runtimeTest.stop",
		{ testSessionId },
	);
	return result.stopped;
}

export async function callGodotRuntimeTool<T extends GodotRuntimeToolResult>(
	name: "observe" | "action" | "wait" | "assert" | "screenshot",
	args: Record<string, unknown>,
): Promise<{ value: T; imageDataUrl: string | null }> {
	const result = await (await createBackendClient()).request<McpCallResult>(
		"mcp.callTool",
		{ serverId: "godot_runtime", name, args },
	);
	const text = result.content.find((item): item is Extract<McpContent, { type: "text" }> => item.type === "text");
	if (text === undefined) throw new Error("Godot runtime tool returned no structured result.");
	const value: T = JSON.parse(text.text) as T;
	const image = result.content.find((item): item is Extract<McpContent, { type: "image" }> => item.type === "image");
	return {
		value,
		imageDataUrl: image === undefined ? null : `data:${image.mimeType};base64,${image.data}`,
	};
}
