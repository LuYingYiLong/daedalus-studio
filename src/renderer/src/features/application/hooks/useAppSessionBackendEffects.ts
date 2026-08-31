import {
	useEffect,
	type Dispatch,
	type MutableRefObject,
	type SetStateAction,
} from "react";
import { onBackendReconnected } from "@/platform/rpc/transport/backend-client";
import type { PendingApproval } from "@/platform/rpc/approval-api";
import type {
	SessionMetadata,
	WorkbenchSnapshot,
} from "@/platform/rpc/types";
import { getPendingApprovalCount } from "@/domain/application/app-helpers";

export type AppSessionBackendEffectsParams = {
	activeSessionId: string | null;
	activeSessionMetadata: SessionMetadata | null;
	activeSessionIdRef: MutableRefObject<string | null>;
	isNewSessionHome: boolean;
	workbench: WorkbenchSnapshot | null;
	takePendingWorkbenchPatch: () => Record<string, unknown>;
	restoreMaterializedHomeDraftSession: (sessionId: string) => Promise<void>;
	handleSessionSelect: (session: SessionMetadata) => Promise<void>;
	setPendingApproval: Dispatch<SetStateAction<PendingApproval | null>>;
	clearApprovalError: () => void;
	refreshPendingApproval: () => Promise<void>;
};

export default function useAppSessionBackendEffects({
	activeSessionId,
	activeSessionMetadata,
	activeSessionIdRef,
	isNewSessionHome,
	workbench,
	takePendingWorkbenchPatch,
	restoreMaterializedHomeDraftSession,
	handleSessionSelect,
	setPendingApproval,
	clearApprovalError,
	refreshPendingApproval,
}: AppSessionBackendEffectsParams): void {
	useEffect((): (() => void) => {
		return onBackendReconnected((): void => {
			takePendingWorkbenchPatch();
			const sessionId: string | null = activeSessionIdRef.current;
			if (
				activeSessionMetadata?.temporary === true &&
				sessionId !== null
			) {
				void restoreMaterializedHomeDraftSession(sessionId);
				return;
			}
			if (sessionId !== null) {
				void handleSessionSelect({ id: sessionId } as SessionMetadata);
			}
		});
	}, [activeSessionId, activeSessionMetadata?.temporary]);

	useEffect((): void => {
		if (
			isNewSessionHome ||
			activeSessionId === null ||
			getPendingApprovalCount(workbench) === 0
		) {
			setPendingApproval(null);
			clearApprovalError();
			return;
		}

		void refreshPendingApproval();
	}, [
		activeSessionId,
		clearApprovalError,
		isNewSessionHome,
		refreshPendingApproval,
		workbench?.pendingApproval?.count,
		workbench?.pendingApproval?.first?.approvalId,
	]);
}
