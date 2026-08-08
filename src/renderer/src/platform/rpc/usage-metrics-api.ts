import { createBackendClient } from "@/platform/rpc/transport/backend-client";

export type UsageSource = "provider" | "estimated" | "missing";
export type UsageMetricsStatus = "success" | "error" | "cancelled";
export type UsageInputTokenSemantics = "fresh" | "total";
export type UsageTrendBucket = "hour" | "day";

export type UsageMetricsFilters = {
	startAt?: string;
	endAt?: string;
	provider?: string;
	model?: string;
	sessionId?: string;
	workspaceId?: string;
	operation?: string;
	status?: UsageMetricsStatus;
	usageSource?: UsageSource;
};

export type UsageMetricsGroupSummary = {
	key: string;
	requests: number;
	successfulRequests: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	realTotalTokens: number;
	estimatedRows: number;
	providerRows: number;
	cacheHitRate: number;
};

export type UsageMetricsSummary = {
	available: boolean;
	errorMessage?: string;
	requests: number;
	successfulRequests: number;
	successRate: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	rawInputTokens: number;
	totalTokens: number;
	realTotalTokens: number;
	estimatedRows: number;
	providerRows: number;
	missingRows: number;
	cacheHitRate: number;
	byProvider: UsageMetricsGroupSummary[];
	byModel: UsageMetricsGroupSummary[];
	bySession: UsageMetricsGroupSummary[];
	byWorkspace: UsageMetricsGroupSummary[];
};

export type UsageMetricsLog = {
	usageId: string;
	requestId: string;
	runId?: string;
	sessionId?: string;
	workspaceId?: string;
	operation: string;
	phaseId?: string;
	provider: string;
	model: string;
	endpointType: string;
	adapterFamily: string;
	startedAt: string;
	completedAt: string;
	durationMs: number;
	firstTokenMs?: number;
	status: UsageMetricsStatus;
	errorCode?: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	rawInputTokens: number;
	totalTokens: number;
	realTotalTokens: number;
	cacheHitRate: number;
	usageSource: UsageSource;
	inputTokenSemantics: UsageInputTokenSemantics;
	streaming: boolean;
	estimatedCostUsd?: number;
};

export type UsageMetricsLogsListResult = {
	available: boolean;
	errorMessage?: string;
	logs: UsageMetricsLog[];
	total: number;
	limit: number;
	offset: number;
};

export type UsageMetricsTrendPoint = {
	bucket: string;
	requests: number;
	successfulRequests: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	realTotalTokens: number;
	cacheHitRate: number;
};

export type UsageMetricsTrendsResult = {
	available: boolean;
	errorMessage?: string;
	bucket: UsageTrendBucket;
	points: UsageMetricsTrendPoint[];
};

export async function fetchUsageMetricsSummary(filters?: UsageMetricsFilters): Promise<UsageMetricsSummary> {
	const client = await createBackendClient();

	return client.request<UsageMetricsSummary>("usage.metrics.summary.get", filters);
}

export async function listUsageMetricsLogs(params?: UsageMetricsFilters & { limit?: number; offset?: number }): Promise<UsageMetricsLogsListResult> {
	const client = await createBackendClient();

	return client.request<UsageMetricsLogsListResult>("usage.metrics.logs.list", params);
}

export async function fetchUsageMetricsTrends(params?: UsageMetricsFilters & { bucket?: UsageTrendBucket }): Promise<UsageMetricsTrendsResult> {
	const client = await createBackendClient();

	return client.request<UsageMetricsTrendsResult>("usage.metrics.trends.get", params);
}
