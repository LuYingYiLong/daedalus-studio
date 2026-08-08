import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
	approveApproval,
	fetchApprovalList,
	rejectApproval,
	setApprovalMode,
	type ApprovalMode,
	type PendingApproval
} from "@/api/approval-api";
import type { NewSessionComposerPreferences } from "@/api/client-preferences-api";
import type { SaveSessionUiMetadataParams } from "@/api/session-api";
import { continueToolBudget, stopToolBudget } from "@/api/chat-api";

type RefValue<T> = { current: T };

export type ApprovalControllerParams = {
	initialMode: ApprovalMode;
	activeSessionId: string | null;
	pendingToolBudgetId: string | undefined;
	activeSessionIdRef: RefValue<string | null>;
	persistSessionUiMetadata: (params: SaveSessionUiMetadataParams) => Promise<void>;
	persistNewSessionComposerDefaults: (patch: Partial<NewSessionComposerPreferences>) => void;
	refreshLatestTimeline: (sessionIdOverride?: string) => Promise<void>;
	setSessionError: (message: string | null) => void;
	onFullTrustRequested: () => void;
};

export type ApprovalController = {
	approvalMode: ApprovalMode;
	setApprovalModeState: Dispatch<SetStateAction<ApprovalMode>>;
	isApprovalModeSaving: boolean;
	pendingApproval: PendingApproval | null;
	setPendingApproval: Dispatch<SetStateAction<PendingApproval | null>>;
	approvalError: string | null;
	clearApprovalError: () => void;
	isApproving: boolean;
	isRejecting: boolean;
	isToolBudgetContinuing: boolean;
	isToolBudgetStopping: boolean;
	toolBudgetError: string | null;
	refreshPendingApproval: () => Promise<void>;
	saveApprovalMode: (nextMode: ApprovalMode, confirmationText?: string) => Promise<boolean>;
	handleApprovalModeChange: (nextMode: ApprovalMode) => void;
	handleApprovalApprove: (approvalId: string, consentText?: string) => Promise<void>;
	handleApprovalReject: (approvalId: string) => Promise<void>;
	handleToolBudgetContinue: (budgetId: string) => Promise<void>;
	handleToolBudgetStop: (budgetId: string) => Promise<void>;
};

export default function useApprovalController(params: ApprovalControllerParams): ApprovalController {
	const [approvalMode, setApprovalModeState] = useState<ApprovalMode>(params.initialMode);
	const [isApprovalModeSaving, setIsApprovalModeSaving] = useState<boolean>(false);
	const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
	const [approvalError, setApprovalError] = useState<string | null>(null);
	const clearApprovalError = useCallback((): void => {
		setApprovalError(null);
	}, []);
	const [isApproving, setIsApproving] = useState<boolean>(false);
	const [isRejecting, setIsRejecting] = useState<boolean>(false);
	const [isToolBudgetContinuing, setIsToolBudgetContinuing] = useState<boolean>(false);
	const [isToolBudgetStopping, setIsToolBudgetStopping] = useState<boolean>(false);
	const [toolBudgetError, setToolBudgetError] = useState<string | null>(null);

	useEffect((): void => {
		setToolBudgetError(null);
	}, [params.pendingToolBudgetId]);

	const refreshPendingApproval = useCallback(async (): Promise<void> => {
		if (params.activeSessionIdRef.current === null) {
			setPendingApproval(null);
			return;
		}
		try {
			const result = await fetchApprovalList();
			setApprovalModeState(result.mode);
			setPendingApproval(result.pending[0] ?? null);
			setApprovalError(null);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Failed to load approvals";
			setApprovalError(message);
			console.error("[App] load approvals failed", error);
		}
	}, [params.activeSessionIdRef]);

	const saveApprovalMode = useCallback(async (nextMode: ApprovalMode, confirmationText?: string): Promise<boolean> => {
		if (nextMode === approvalMode || isApprovalModeSaving) {
			return false;
		}
		const previousMode: ApprovalMode = approvalMode;
		setApprovalModeState(nextMode);
		setIsApprovalModeSaving(true);
		params.setSessionError(null);
		try {
			const result = await setApprovalMode(nextMode, confirmationText);
			setApprovalModeState(result.mode);
			await params.persistSessionUiMetadata({ approvalMode: result.mode });
			params.persistNewSessionComposerDefaults({ approvalMode: result.mode });
			return true;
		} catch (error: unknown) {
			setApprovalModeState(previousMode);
			params.setSessionError(error instanceof Error ? error.message : "Failed to save approval mode");
			console.error("[App] save approval mode failed", error);
			return false;
		} finally {
			setIsApprovalModeSaving(false);
		}
	}, [approvalMode, isApprovalModeSaving, params]);

	const handleApprovalModeChange = useCallback((nextMode: ApprovalMode): void => {
		if (nextMode === approvalMode || isApprovalModeSaving) return;
		if (nextMode === "full-trust") {
			params.onFullTrustRequested();
			return;
		}
		void saveApprovalMode(nextMode);
	}, [approvalMode, isApprovalModeSaving, params, saveApprovalMode]);

	const handleApprovalApprove = useCallback(async (approvalId: string, consentText?: string): Promise<void> => {
		if (isApproving || isRejecting) return;
		const previousApproval = pendingApproval;
		setIsApproving(true);
		setApprovalError(null);
		setPendingApproval(null);
		try {
			await approveApproval(approvalId, consentText);
			await refreshPendingApproval();
			await params.refreshLatestTimeline();
		} catch (error: unknown) {
			setPendingApproval(previousApproval);
			setApprovalError(error instanceof Error ? error.message : "Failed to approve tool execution");
			console.error("[App] approve approval failed", error);
		} finally {
			setIsApproving(false);
		}
	}, [isApproving, isRejecting, pendingApproval, params.refreshLatestTimeline, refreshPendingApproval]);

	const handleApprovalReject = useCallback(async (approvalId: string): Promise<void> => {
		if (isApproving || isRejecting) return;
		const previousApproval = pendingApproval;
		setIsRejecting(true);
		setApprovalError(null);
		setPendingApproval(null);
		try {
			await rejectApproval(approvalId);
			await refreshPendingApproval();
			await params.refreshLatestTimeline();
		} catch (error: unknown) {
			setPendingApproval(previousApproval);
			setApprovalError(error instanceof Error ? error.message : "Failed to reject tool execution");
			console.error("[App] reject approval failed", error);
		} finally {
			setIsRejecting(false);
		}
	}, [isApproving, isRejecting, pendingApproval, params.refreshLatestTimeline, refreshPendingApproval]);

	const handleToolBudgetContinue = useCallback(async (budgetId: string): Promise<void> => {
		if (isToolBudgetContinuing || isToolBudgetStopping) return;
		setIsToolBudgetContinuing(true);
		setToolBudgetError(null);
		try {
			await continueToolBudget(budgetId);
			await params.refreshLatestTimeline();
		} catch (error: unknown) {
			setToolBudgetError(error instanceof Error ? error.message : "Failed to continue tool budget");
			console.error("[App] continue tool budget failed", error);
		} finally {
			setIsToolBudgetContinuing(false);
		}
	}, [isToolBudgetContinuing, isToolBudgetStopping, params.refreshLatestTimeline]);

	const handleToolBudgetStop = useCallback(async (budgetId: string): Promise<void> => {
		if (isToolBudgetContinuing || isToolBudgetStopping) return;
		setIsToolBudgetStopping(true);
		setToolBudgetError(null);
		try {
			await stopToolBudget(budgetId);
			await params.refreshLatestTimeline();
		} catch (error: unknown) {
			setToolBudgetError(error instanceof Error ? error.message : "Failed to stop at tool budget");
			console.error("[App] stop tool budget failed", error);
		} finally {
			setIsToolBudgetStopping(false);
		}
	}, [isToolBudgetContinuing, isToolBudgetStopping, params.refreshLatestTimeline]);

	return {
		approvalMode,
		setApprovalModeState,
		isApprovalModeSaving,
		pendingApproval,
		setPendingApproval,
		approvalError,
		clearApprovalError,
		isApproving,
		isRejecting,
		isToolBudgetContinuing,
		isToolBudgetStopping,
		toolBudgetError,
		refreshPendingApproval,
		saveApprovalMode,
		handleApprovalModeChange,
		handleApprovalApprove,
		handleApprovalReject,
		handleToolBudgetContinue,
		handleToolBudgetStop
	};
}

