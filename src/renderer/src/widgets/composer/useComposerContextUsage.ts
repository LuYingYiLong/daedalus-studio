import { useCallback, useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";
import type { ChatMode } from "@/platform/rpc/chat-api";
import {
	compressSession,
	estimateContextUsage,
	type ContextUsageEstimate,
	type EstimateContextUsageParams,
} from "@/platform/rpc/context-api";
import type { AdditionalContextItem } from "@/platform/rpc/types";

type UseComposerContextUsageParams = {
	message: string;
	mode: ChatMode;
	provider?: string | undefined;
	model?: string | undefined;
	additionalContext: readonly AdditionalContextItem[];
	visible: boolean;
	t: TFunction<"common">;
};

type ComposerContextUsageController = {
	contextUsage: ContextUsageEstimate | null;
	contextUsageError: string | null;
	isCompressingContext: boolean;
	contextCompressionNotice: string | null;
	refreshContextUsage: () => Promise<void>;
	handleCompressContext: () => Promise<void>;
};

const CONTEXT_USAGE_REFRESH_INTERVAL_MS: number = 5_000;

function getErrorMessage(error: unknown, t: TFunction<"common">): string {
	return error instanceof Error ? error.message : t("composer.contextUsage.errors.estimate");
}

export function formatTokenCount(tokens: number): string {
	if (!Number.isFinite(tokens)) return "0";
	const absoluteTokens: number = Math.abs(tokens);
	if (absoluteTokens >= 1_000_000) {
		const value: number = tokens / 1_000_000;
		return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}M`;
	}
	if (absoluteTokens >= 1_000) {
		const value: number = tokens / 1_000;
		return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}K`;
	}
	return Math.max(0, Math.round(tokens)).toLocaleString();
}

export default function useComposerContextUsage({
	message,
	mode,
	provider,
	model,
	additionalContext,
	visible,
	t,
}: UseComposerContextUsageParams): ComposerContextUsageController {
	const requestIdRef = useRef<number>(0);
	const paramsRef = useRef<EstimateContextUsageParams>({});
	const [contextUsage, setContextUsage] = useState<ContextUsageEstimate | null>(null);
	const [contextUsageError, setContextUsageError] = useState<string | null>(null);
	const [isCompressingContext, setIsCompressingContext] = useState<boolean>(false);
	const [contextCompressionNotice, setContextCompressionNotice] = useState<string | null>(null);

	paramsRef.current = { message, mode, provider, model, additionalContext: [...additionalContext] };

	const refreshContextUsage = useCallback(async (): Promise<void> => {
		setContextUsageError(null);
		const requestId: number = ++requestIdRef.current;
		try {
			const usage: ContextUsageEstimate = await estimateContextUsage(paramsRef.current);
			if (requestId === requestIdRef.current) setContextUsage(usage);
		} catch (error: unknown) {
			if (requestId === requestIdRef.current) setContextUsageError(getErrorMessage(error, t));
		}
	}, [t]);

	useEffect((): (() => void) => {
		if (!visible) {
			setContextUsage(null);
			setContextUsageError(null);
			return (): void => {};
		}
		let disposed: boolean = false;
		let inFlight: boolean = false;
		const pollContextUsage = async (): Promise<void> => {
			if (inFlight) return;
			inFlight = true;
			const requestId: number = ++requestIdRef.current;
			try {
				const usage: ContextUsageEstimate = await estimateContextUsage(paramsRef.current);
				if (!disposed && requestId === requestIdRef.current) {
					setContextUsage(usage);
					setContextUsageError(null);
				}
			} catch (error: unknown) {
				if (!disposed && requestId === requestIdRef.current) setContextUsageError(getErrorMessage(error, t));
			} finally {
				inFlight = false;
			}
		};
		setContextUsageError(null);
		void pollContextUsage();
		const timer: number = window.setInterval((): void => void pollContextUsage(), CONTEXT_USAGE_REFRESH_INTERVAL_MS);
		return (): void => {
			disposed = true;
			requestIdRef.current += 1;
			window.clearInterval(timer);
		};
	}, [additionalContext, mode, model, provider, t, visible]);

	const handleCompressContext = useCallback(async (): Promise<void> => {
		setIsCompressingContext(true);
		setContextUsageError(null);
		setContextCompressionNotice(null);
		try {
			const result = await compressSession(8);
			if (!result.compressed && result.reason !== undefined) {
				setContextUsageError(result.reason);
			} else if (result.compressed) {
				setContextCompressionNotice(t("composer.contextUsage.compressionResult", {
					before: formatTokenCount(result.beforeTokens ?? 0),
					after: formatTokenCount(result.afterTokens ?? 0),
					saved: formatTokenCount(result.savedTokens ?? 0),
					restorable: result.restorableBlockCount ?? 0,
				}));
			}
			await refreshContextUsage();
		} catch (error: unknown) {
			setContextUsageError(getErrorMessage(error, t));
		} finally {
			setIsCompressingContext(false);
		}
	}, [refreshContextUsage, t]);

	return {
		contextUsage,
		contextUsageError,
		isCompressingContext,
		contextCompressionNotice,
		refreshContextUsage,
		handleCompressContext,
	};
}
