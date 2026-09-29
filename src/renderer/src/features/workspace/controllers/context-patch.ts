import type {
	WorkbenchPatch,
	WorkbenchPatchResult,
	WorkbenchSnapshot,
} from "@/platform/rpc/types";

type ContextPatchAction = NonNullable<WorkbenchPatch["additionalContextAction"]>;

export type ContextPatchScope = {
	getNavigationVersion: () => number;
	getActiveSessionId: () => string | null;
	ensureActiveSessionId: () => Promise<string | null>;
	queueWorkbenchPatch: (patch: WorkbenchPatch, immediate?: boolean) => void;
	sendWorkbenchPatch: (
		patch: WorkbenchPatch,
		applyResult?: boolean,
		beforeSend?: () => void,
	) => Promise<WorkbenchPatchResult | null>;
	applyWorkbench: (workbench: WorkbenchSnapshot) => void;
};

export async function patchContextForCurrentSession(
	action: ContextPatchAction,
	scope: ContextPatchScope,
): Promise<"queued" | "applied" | "stale" | "unavailable"> {
	const navigationVersion: number = scope.getNavigationVersion();
	const activeSessionId: string | null = scope.getActiveSessionId();
	const patch: WorkbenchPatch = { additionalContextAction: action };
	if (activeSessionId !== null) {
		scope.queueWorkbenchPatch(patch, true);
		return "queued";
	}

	// NewSessionHome has no backend session yet. A patch sent now would modify
	// the previously opened session on this connection.
	const sessionId: string | null = await scope.ensureActiveSessionId();
	if (scope.getNavigationVersion() !== navigationVersion) {
		return "stale";
	}
	if (sessionId === null) {
		return "unavailable";
	}
	const isCurrent = (): boolean =>
		scope.getNavigationVersion() === navigationVersion &&
		scope.getActiveSessionId() === sessionId;
	if (!isCurrent()) {
		return "stale";
	}

	try {
		const result: WorkbenchPatchResult | null = await scope.sendWorkbenchPatch(
			patch,
			false,
			(): void => {
				if (!isCurrent()) {
					throw new Error("context_patch_scope_changed");
				}
			},
		);
		if (!isCurrent()) {
			return "stale";
		}
		if (result === null || result.workbench.sessionId !== sessionId) {
			throw new Error("context_patch_session_mismatch");
		}
		scope.applyWorkbench(result.workbench);
		return "applied";
	} catch (error: unknown) {
		if (!isCurrent()) {
			return "stale";
		}
		throw error;
	}
}
