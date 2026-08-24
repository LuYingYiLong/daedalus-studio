import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { MessageQueueItem, WorkbenchSnapshot } from "@/platform/rpc/types";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";
import {
	applyResponseFinished,
	getUnreadResponseSessionId,
} from "@/domain/workspace/session-unread";
import {
	applyRunningSessionEvent,
	type RunningSessionState,
} from "@/domain/workspace/session-running";

type RefValue<T> = { current: T };

export type SessionRuntimeEventParams = {
	activeSessionIdRef: RefValue<string | null>;
	activeWorkbenchRef: RefValue<WorkbenchSnapshot | null>;
	windowFocusedRef: RefValue<boolean>;
	setRunningSessionState: Dispatch<SetStateAction<RunningSessionState>>;
	setUnreadSessionIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
};

export default function useSessionRuntimeEvents({
	activeSessionIdRef,
	activeWorkbenchRef,
	windowFocusedRef,
	setRunningSessionState,
	setUnreadSessionIds,
}: SessionRuntimeEventParams): (event: BackendEvent) => void {
	return useCallback((event: BackendEvent): void => {
		setRunningSessionState((current: RunningSessionState): RunningSessionState => {
			return applyRunningSessionEvent(current, event);
		});
		const responseSessionId: string | null = getUnreadResponseSessionId(event);
		if (responseSessionId === null) {
			return;
		}
		if (
			event.event === "agent.goal.state" &&
			activeWorkbenchRef.current?.messageQueue.some(
				(item: MessageQueueItem): boolean =>
					item.status === "pending" || item.status === "sending",
			) === true
		) {
			return;
		}

		setUnreadSessionIds((currentSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
			return applyResponseFinished(currentSessionIds, {
				sessionId: responseSessionId,
				activeSessionId: activeSessionIdRef.current,
				windowFocused: windowFocusedRef.current,
			});
		});
	}, [activeSessionIdRef, activeWorkbenchRef, setRunningSessionState, setUnreadSessionIds, windowFocusedRef]);
}
