import { BackendRpcClient } from "./backend-rpc-client";
import type { ClientHelloResult, SessionListResult, WorkspaceListResult } from "./types";

const studioCapabilities: Record<string, boolean> = {
	sessionSubscribe: true,
	approval: true,
	inlineDiffView: true,
	editorTools: false,
	editorUndoRedo: false,
	inlineDiffUndo: false
};

export async function probeBackendWorkspaceAndSessions(): Promise<void> {
	if (!window.electronAPI?.backend) {
		console.warn("[Daedalus backend] 当前环境没有暴露 electronAPI.backend");
		return;
	}

	const port: number = await window.electronAPI.backend.getPort();
	const client: BackendRpcClient = new BackendRpcClient(`ws://localhost:${port}`);

	try {
		await client.connect();

		const hello: ClientHelloResult = await client.request("client.hello", {
			clientType: "studio",
			clientName: "Daedalus Studio",
			capabilities: studioCapabilities
		});
		const [workspaceList, sessionList]: [WorkspaceListResult, SessionListResult] = await Promise.all([
			client.request<WorkspaceListResult>("workspace.list"),
			client.request<SessionListResult>("session.list")
		]);

		console.groupCollapsed("[Daedalus backend] 工作区与会话快照");
		console.log("hello", hello);
		console.log("workspaces", workspaceList.workspaces);
		console.log("activeWorkspaceId", workspaceList.active);
		console.log("connectedWorkspaceIds", workspaceList.connected);
		console.log("sessions", sessionList.sessions);
		console.groupEnd();
	} catch (error: unknown) {
		console.error("[Daedalus backend] 获取工作区/会话失败", error);
	} finally {
		client.close();
	}
}
