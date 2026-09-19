export type HomeWorkbenchScope = {
	sessionId: string | null;
	layoutScopeId: string | null;
	terminalRuntimeScopeId: string | null;
	summaryScopeKey: string;
};

type ResolveHomeWorkbenchScopeParams = {
	primarySurface: "chat" | "flow";
	isHome: boolean;
	activeSessionId: string | null;
	flowId: string | null;
	workspaceId: string | null;
};

/** Flow 不绑定 Chat 会话，但仍使用文档 ID 隔离布局和终端资源 */
export function resolveHomeWorkbenchScope({
	primarySurface,
	isHome,
	activeSessionId,
	flowId,
	workspaceId,
}: ResolveHomeWorkbenchScopeParams): HomeWorkbenchScope {
	if (primarySurface === "flow") {
		const flowScopeId: string = `flow:${flowId ?? "none"}`;
		return {
			sessionId: null,
			layoutScopeId: flowScopeId,
			terminalRuntimeScopeId: flowScopeId,
			summaryScopeKey: `${flowScopeId}:workspace:${workspaceId ?? "none"}`,
		};
	}

	const sessionId: string | null = isHome ? null : activeSessionId;
	return {
		sessionId,
		layoutScopeId: activeSessionId,
		terminalRuntimeScopeId: activeSessionId,
		summaryScopeKey:
			sessionId ?? `workspace:${workspaceId ?? "none"}`,
	};
}
