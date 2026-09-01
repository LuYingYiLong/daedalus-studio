import type {
	BackendEvent,
	BackendRpcClient,
} from "@/platform/rpc/transport/backend-rpc-client";
import {
	listGodotRuntimeTestSessions,
	type GodotRuntimeTestSession,
} from "@/platform/rpc/godot-runtime-test-api";
import { fetchWorkspaces } from "@/platform/rpc/workspace-api";
import type { WorkspaceConfig, WorkspaceListResult } from "@/platform/rpc/types";
import {
	launchVisibleGodotRuntimeTest,
	stopVisibleGodotRuntimeTest,
	waitForGodotRuntimeTestOnline,
} from "./runtime-test-launcher";

// Leave a margin before Backend's five-minute tool deadline so Studio can
// return a concrete startup error instead of racing the outer timeout.
const STARTUP_TIMEOUT_MS: number = 4 * 60_000;
const CALL_ID_PATTERN: RegExp = /^godot-runtime-start-[0-9a-f-]{36}$/u;
const attachedClients: WeakSet<BackendRpcClient> = new WeakSet();

type StartRequest = {
	callId: string;
	sessionId: string;
	workspaceId: string;
	sourceFolderId?: string | undefined;
};

function parseStartRequest(value: unknown): StartRequest {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("runtime_test_start_request_invalid");
	}
	const record = value as Record<string, unknown>;
	if (typeof record.callId !== "string" || !CALL_ID_PATTERN.test(record.callId)
		|| typeof record.sessionId !== "string" || record.sessionId.length === 0
		|| typeof record.workspaceId !== "string" || record.workspaceId.length === 0
		|| (record.sourceFolderId !== undefined && typeof record.sourceFolderId !== "string")) {
		throw new Error("runtime_test_start_request_invalid");
	}
	return {
		callId: record.callId,
		sessionId: record.sessionId,
		workspaceId: record.workspaceId,
		...(typeof record.sourceFolderId === "string" ? { sourceFolderId: record.sourceFolderId } : {}),
	};
}

function getErrorCode(error: unknown): string {
	if (!(error instanceof Error)) return "runtime_test_start_failed";
	return error.message.match(/runtime_test_[a-z_]+/u)?.[0] ?? "runtime_test_start_failed";
}

export function bindGodotRuntimeTestRuntime(client: BackendRpcClient): void {
	if (attachedClients.has(client)) return;
	attachedClients.add(client);
	const operations: Map<string, { controller: AbortController; createdSessionId: string | null }> = new Map();
	const handled: Set<string> = new Set();

	client.addConnectionListener(({ state }): void => {
		if (state !== "disconnected") return;
		for (const operation of operations.values()) operation.controller.abort();
		operations.clear();
	});
	client.addEventListener((event: BackendEvent): void => {
			if (event.event === "godot.runtimeTest.start.cancel") {
				const data = event.data as { callId?: unknown } | undefined;
				if (typeof data?.callId === "string") operations.get(data.callId)?.controller.abort();
				return;
			}
			if (event.event !== "godot.runtimeTest.start.request") return;
			void (async (): Promise<void> => {
				let request: StartRequest;
				try {
					request = parseStartRequest(event.data);
				} catch {
					return;
				}
				if (request.sessionId !== event.sessionId || handled.has(request.callId)) return;
				handled.add(request.callId);
				if (handled.size > 256) handled.delete(handled.values().next().value!);
				const controller = new AbortController();
				const operation = { controller, createdSessionId: null as string | null };
				operations.set(request.callId, operation);
				try {
					const workspaceList: WorkspaceListResult = await fetchWorkspaces();
					const workspace: WorkspaceConfig | undefined = workspaceList.workspaces.find(
						(candidate): boolean => candidate.id === request.workspaceId,
					);
					if (workspace === undefined) throw new Error("runtime_test_workspace_unavailable");
					const existing: GodotRuntimeTestSession[] = await listGodotRuntimeTestSessions(workspace.id);
					const online: GodotRuntimeTestSession | undefined = existing.find(
						(candidate): boolean => candidate.online && candidate.runtimeInstanceId !== null,
					);
					if (online !== undefined) {
						await client.request("godot.runtimeTest.start.result", {
							callId: request.callId,
							ok: true,
							result: { ...online, reused: true, visibleWindow: true },
						});
						return;
					}

					for (const stale of existing) await stopVisibleGodotRuntimeTest(stale.testSessionId);
					if (controller.signal.aborted) throw new Error("runtime_test_start_cancelled");
					const launched = await launchVisibleGodotRuntimeTest(workspace, request.sourceFolderId);
					operation.createdSessionId = launched.session.testSessionId;
					const connected: GodotRuntimeTestSession = await waitForGodotRuntimeTestOnline(
						workspace.id,
						launched.session.testSessionId,
						controller.signal,
						STARTUP_TIMEOUT_MS,
					);
					if (controller.signal.aborted) throw new Error("runtime_test_start_cancelled");
					await client.request("godot.runtimeTest.start.result", {
						callId: request.callId,
						ok: true,
						result: { ...connected, reused: false, visibleWindow: true },
					});
				} catch (error: unknown) {
					if (operation.createdSessionId !== null) await stopVisibleGodotRuntimeTest(operation.createdSessionId);
					if (client.isOpen()) {
						const code: string = getErrorCode(error);
						await client.request("godot.runtimeTest.start.result", {
							callId: request.callId,
							ok: false,
							error: {
								code,
								message: code,
								retryable: ["runtime_test_start_timeout", "runtime_test_studio_disconnected"].includes(code),
							},
						}).catch((): void => undefined);
					}
				} finally {
					operations.delete(request.callId);
				}
			})().catch((): void => undefined);
	});
}
