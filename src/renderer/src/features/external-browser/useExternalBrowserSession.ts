import { useEffect } from "react";
import { bindExternalBrowserRuntime } from "./external-browser-runtime";

export function useExternalBrowserSession(
	sessionId: string | null,
	workspaceId: string | null,
): void {
	useEffect(
		() => bindExternalBrowserRuntime(sessionId, workspaceId),
		[sessionId, workspaceId],
	);
}
