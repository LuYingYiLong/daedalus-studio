import type {
	WorkspaceConfig,
	WorkspaceSourceFolder,
} from "@/platform/rpc/types";
import {
	createGodotRuntimeTestSession,
	listGodotRuntimeTestSessions,
	stopGodotRuntimeTestSession,
	type GodotRuntimeTestSession,
	type GodotRuntimeTestSessionToken,
} from "@/platform/rpc/godot-runtime-test-api";

const STATUS_POLL_INTERVAL_MS: number = 250;

export type VisibleGodotRuntimeLaunch = {
	session: GodotRuntimeTestSessionToken;
	source: WorkspaceSourceFolder;
};

export function selectGodotRuntimeSource(
	workspace: WorkspaceConfig,
	requestedSourceFolderId?: string | undefined,
): WorkspaceSourceFolder {
	const godotSources: WorkspaceSourceFolder[] = workspace.sourceFolders.filter(
		(source): boolean => source.capabilities.godot,
	);
	const selected: WorkspaceSourceFolder | undefined = requestedSourceFolderId === undefined
		? godotSources.find((source): boolean => source.id === workspace.primarySourceFolderId)
			?? (godotSources.length === 1 ? godotSources[0] : undefined)
		: godotSources.find((source): boolean => source.id === requestedSourceFolderId);
	if (selected === undefined) {
		throw new Error(godotSources.length === 0
			? "runtime_test_godot_source_unavailable"
			: "runtime_test_source_required");
	}
	return selected;
}

export async function launchVisibleGodotRuntimeTest(
	workspace: WorkspaceConfig,
	requestedSourceFolderId?: string | undefined,
): Promise<VisibleGodotRuntimeLaunch> {
	const source: WorkspaceSourceFolder = selectGodotRuntimeSource(workspace, requestedSourceFolderId);
	let created: GodotRuntimeTestSessionToken | null = null;
	try {
		await window.electronAPI.godotProjects.prepareRuntimeTest(source.path);
		created = await createGodotRuntimeTestSession({
			workspaceId: workspace.id,
			sourceFolderId: source.id,
		});
		await window.electronAPI.workspaceFs.openLaunchTarget({
			workspaceRoot: source.path,
			targetId: "godot",
			godotExecutablePath: workspace.godotExecutablePath ?? null,
			godotRunMode: "project",
			godotRuntimeTest: {
				testSessionId: created.testSessionId,
				testSessionToken: created.token,
			},
		});
		return { session: created, source };
	} catch (error: unknown) {
		if (created !== null) {
			await Promise.allSettled([
				window.electronAPI.workspaceFs.stopGodotRuntimeTest(created.testSessionId),
				stopGodotRuntimeTestSession(created.testSessionId),
			]);
		}
		throw error;
	}
}

export async function waitForGodotRuntimeTestOnline(
	workspaceId: string,
	testSessionId: string,
	abortSignal: AbortSignal,
	timeoutMs: number,
): Promise<GodotRuntimeTestSession> {
	const deadline: number = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (abortSignal.aborted) throw new Error("runtime_test_start_cancelled");
		const sessions: GodotRuntimeTestSession[] = await listGodotRuntimeTestSessions(workspaceId);
		const session: GodotRuntimeTestSession | undefined = sessions.find(
			(candidate): boolean => candidate.testSessionId === testSessionId,
		);
		if (session?.online === true && session.runtimeInstanceId !== null) return session;
		await waitForDelay(STATUS_POLL_INTERVAL_MS, abortSignal);
	}
	throw new Error("runtime_test_start_timeout");
}

export async function stopVisibleGodotRuntimeTest(testSessionId: string): Promise<void> {
	await Promise.allSettled([
		window.electronAPI.workspaceFs.stopGodotRuntimeTest(testSessionId),
		stopGodotRuntimeTestSession(testSessionId),
	]);
}

function waitForDelay(delayMs: number, abortSignal: AbortSignal): Promise<void> {
	return new Promise<void>((resolve, reject): void => {
		if (abortSignal.aborted) {
			reject(new Error("runtime_test_start_cancelled"));
			return;
		}
		const timer: number = window.setTimeout((): void => {
			abortSignal.removeEventListener("abort", handleAbort);
			resolve();
		}, delayMs);
		const handleAbort = (): void => {
			window.clearTimeout(timer);
			abortSignal.removeEventListener("abort", handleAbort);
			reject(new Error("runtime_test_start_cancelled"));
		};
		abortSignal.addEventListener("abort", handleAbort, { once: true });
	});
}
