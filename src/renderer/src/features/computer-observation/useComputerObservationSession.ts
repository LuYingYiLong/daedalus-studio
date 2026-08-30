import { useEffect } from "react";
import { bindComputerRuntime } from "./computer-runtime";

export function useComputerObservationSession(
	sessionId: string | null,
	workspaceId: string | null,
): void {
	useEffect(
		() => bindComputerRuntime(sessionId, workspaceId),
		[sessionId, workspaceId],
	);
}
