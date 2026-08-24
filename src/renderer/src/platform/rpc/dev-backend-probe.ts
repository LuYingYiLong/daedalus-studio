import { BackendRpcClient } from "@/platform/rpc/transport/backend-rpc-client";
import type {
	ClientHelloResult,
	SessionListResult,
	WorkspaceListResult,
} from "./types";

const studioCapabilities: Record<string, boolean> = {
	sessionSubscribe: true,
	approval: true,
	inlineDiffView: true,
	editorTools: false,
	editorUndoRedo: false,
	inlineDiffUndo: false,
};

export async function probeBackendWorkspaceAndSessions(): Promise<void> {
	if (!window.electronAPI?.backend) {
		console.warn(
			"[Daedalus backend] Current environment has no exposure electronAPI.backend",
		);
		return;
	}

	const connection = await window.electronAPI.backend.getConnectionInfo();
	const client: BackendRpcClient = new BackendRpcClient(
		`ws://127.0.0.1:${connection.port}`,
		{
			authProtocol: connection.authProtocol,
		},
	);

	try {
		await client.connect();

		const hello: ClientHelloResult = await client.request("client.hello", {
			clientType: "studio",
			clientName: "Daedalus Studio",
			capabilities: studioCapabilities,
		});
		const [workspaceList, sessionList]: [
			WorkspaceListResult,
			SessionListResult,
		] = await Promise.all([
			client.request<WorkspaceListResult>("workspace.list"),
			client.request<SessionListResult>("session.list"),
		]);

		console.groupCollapsed(
			"[Daedalus backend] Workspace and Session Snapshots",
		);
		console.log("hello", hello);
		console.log("workspaces", workspaceList.workspaces);
		console.log("activeWorkspaceId", workspaceList.active);
		console.log("connectedWorkspaceIds", workspaceList.connected);
		console.log("sessions", sessionList.sessions);
		console.groupEnd();
	} catch (error: unknown) {
		console.error(
			"[Daedalus backend] Failed to obtain workspace session",
			error,
		);
	} finally {
		client.close();
	}
}
