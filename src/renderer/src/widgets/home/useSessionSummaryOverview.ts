import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WorkspaceConfig } from "@/platform/rpc/types";
import {
	fetchSessionOverview,
	fetchWorkspaceOverview,
	type SessionOverviewResult,
} from "@/platform/rpc/session-overview-api";

type SummaryOverviewTarget = {
	scopeKey: string;
	sessionId: string | null;
	workspace: WorkspaceConfig | null;
};

type UseSessionSummaryOverviewParams = {
	scopeKey: string;
	sessionId: string | null;
	workspace: WorkspaceConfig | null;
	previewLimit: number;
};

export type SessionSummaryOverviewController = {
	summaryOpen: boolean;
	summaryOverview: SessionOverviewResult | null;
	isSummaryLoading: boolean;
	summaryError: string | null;
	setSummaryOpen: (open: boolean) => void;
	loadSummaryOverview: (
		planLimit?: number,
		sourceLimit?: number,
		silent?: boolean,
	) => Promise<SessionOverviewResult | null>;
	handleSummaryOpenChange: (open: boolean) => void;
};

function useSessionSummaryOverview({
	scopeKey,
	sessionId,
	workspace,
	previewLimit,
}: UseSessionSummaryOverviewParams): SessionSummaryOverviewController {
	const { t } = useTranslation();
	const [summaryOpen, setSummaryOpen] = useState<boolean>(false);
	const [summaryOverview, setSummaryOverview] = useState<SessionOverviewResult | null>(null);
	const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(false);
	const [summaryError, setSummaryError] = useState<string | null>(null);
	const requestIdRef = useRef<number>(0);
	const targetRef = useRef<SummaryOverviewTarget>({ scopeKey, sessionId, workspace });
	targetRef.current = { scopeKey, sessionId, workspace };

	const loadSummaryOverview = useCallback(async (
		planLimit: number = previewLimit,
		sourceLimit: number = previewLimit,
		silent: boolean = false,
	): Promise<SessionOverviewResult | null> => {
		const target = targetRef.current;
		if (target.sessionId === null && target.workspace === null) {
			return null;
		}

		const requestId: number = ++requestIdRef.current;
		if (!silent) {
			setIsSummaryLoading(true);
			setSummaryError(null);
		}
		try {
			const result: SessionOverviewResult = target.sessionId !== null
				? await fetchSessionOverview({ sessionId: target.sessionId, planLimit, sourceLimit })
				: await fetchWorkspaceOverview(target.workspace!);
			if (requestId !== requestIdRef.current || target.scopeKey !== targetRef.current.scopeKey) {
				return null;
			}
			setSummaryOverview(result);
			return result;
		} catch (error: unknown) {
			if (requestId !== requestIdRef.current || target.scopeKey !== targetRef.current.scopeKey) {
				return null;
			}
			console.error("[SessionSummary] failed to load overview", error);
			if (!silent) {
				setSummaryError(error instanceof Error ? error.message : t("agentPage.summary.errors.load"));
			}
			return null;
		} finally {
			if (!silent && requestId === requestIdRef.current) {
				setIsSummaryLoading(false);
			}
		}
	}, [previewLimit, t]);

	useEffect((): void => {
		requestIdRef.current += 1;
		setSummaryOpen(false);
		setSummaryOverview(null);
		setIsSummaryLoading(false);
		setSummaryError(null);
	}, [scopeKey]);
	useEffect((): void => {
		if (sessionId !== null || workspace !== null) {
			void loadSummaryOverview();
		}
	}, [loadSummaryOverview, scopeKey, sessionId, workspace]);

	const handleSummaryOpenChange = useCallback((open: boolean): void => {
		setSummaryOpen(open);
		if (!open) {
			return;
		}
		if (summaryOverview === null && summaryError === null && !isSummaryLoading) {
			void loadSummaryOverview();
			return;
		}
		void loadSummaryOverview(previewLimit, previewLimit, true);
	}, [isSummaryLoading, loadSummaryOverview, previewLimit, summaryError, summaryOverview]);

	return {
		summaryOpen,
		summaryOverview,
		isSummaryLoading,
		summaryError,
		setSummaryOpen,
		loadSummaryOverview,
		handleSummaryOpenChange,
	};
}

export default useSessionSummaryOverview;
