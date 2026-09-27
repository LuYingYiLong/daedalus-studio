import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type { FlowNodeTypeDefinition } from "./types";

export type PluginSource =
	| { type: "local"; path: string }
	| { type: "tarball"; path: string; sha256: string }
	| { type: "npm"; packageName: string; version: string }
	| { type: "git"; url: string; commit: string };

export type PluginCompatibility = {
	daedalus: "native" | "unknown";
	entryPaths: string[];
	unsupportedFeatures: string[];
	warnings: string[];
	classification: "native" | "metadata-only" | "unsupported";
};

export type PluginPresentation = {
	description?: string;
	readme?: string;
	changelog?: string;
	iconDataUrl?: string;
};

export type PluginRecord = {
	id: string;
	packageName: string;
	version: string;
	source: PluginSource;
	packageRoot: string;
	contentHash: string;
	manifestHash: string;
	fingerprint: string;
	compatibility: PluginCompatibility;
	trust: "review_required" | "trusted" | "disabled";
	enabled: boolean;
	installedAt: string;
	updatedAt: string;
	lastError?: string;
	presentation?: PluginPresentation;
	nativePlugin?: {
		apiVersion: number;
		entry: string;
		capabilities: Array<"tools" | "skills" | "hooks" | "mcp" | "flowNodes" | "flowHostTools">;
		flowNodes?: Array<Omit<FlowNodeTypeDefinition, "pluginFingerprint"> & { handlerName: string }>;
	};
	p2?: {
		apiVersion: number;
		capabilities: Record<string, number | undefined>;
		declarations: Record<string, unknown>;
	};
	dependencyLockHash?: string;
	runtime?: PluginRuntimeSnapshot;
	isolation?: PluginRuntimeSnapshot["isolation"];
};

export type PluginRuntimeSnapshot = {
	pluginId: string;
	status:
		| "stopped"
		| "starting"
		| "ready"
		| "failed"
		| "disabled"
		| "quarantined";
	activeSessions: number;
	registeredTools: number;
	registeredSkills: number;
	registeredHooks: number;
	registeredMcpServers: number;
	dependencyStatus:
		| "not_required"
		| "pending"
		| "ready"
		| "needs_network"
		| "failed";
	lastError?: string;
	isolation?: {
		status: "none" | "quarantined";
		reason?: string;
		failureCount: number;
		windowStartedAt?: string;
		lastFailureAt?: string;
		updatedAt: string;
	};
	resourceUsage?: {
		activeCalls: number;
		pendingCalls: number;
		rssBytes?: number;
		lastMeasuredAt?: string;
	};
	lastExitCode?: number | null;
	updatedAt: string;
};

export type PluginRuntimeLog = {
	id: string;
	pluginId: string;
	sessionId?: string;
	event: string;
	status: string;
	message?: string;
	durationMs?: number;
	createdAt: string;
};

export type PluginDevelopmentDiagnostic = {
	code: string;
	message: string;
	severity: "info" | "warning" | "error";
	stage:
		| "static"
		| "sandbox"
		| "registration"
		| "test"
		| "protocol"
		| "timeout"
		| "cleanup";
	retryable: boolean;
	path?: string;
	caseId?: string;
	capability?: string;
	hint?: string;
	details?: Record<string, string>;
};

export type PluginDevelopmentTestResult = {
	runId: string;
	ok: boolean;
	pluginId: string;
	revision: string;
	durationMs: number;
	sandbox: {
		available: boolean;
		mode: "windows-helper" | "bubblewrap" | "sandbox-exec" | "unavailable";
		network: "disabled";
		workspaceDisplay: string;
	};
	passed: number;
	failed: number;
	cases: Array<{
		id: string;
		capability: string;
		target?: string;
		status: "passed" | "failed" | "skipped";
		durationMs: number;
		message?: string;
		code?: string;
		retryable: boolean;
	}>;
	diagnostics: PluginDevelopmentDiagnostic[];
};

export type PluginDevelopmentStatus = {
	slug: string;
	revision: string;
	phase:
		| "idle"
		| "preparing"
		| "validating"
		| "awaiting_install"
		| "awaiting_trust"
		| "testing"
		| "passed"
		| "failed"
		| "exhausted"
		| "cancelled"
		| "interrupted";
	staticAttempt: number;
	runtimeAttempt: number;
	staticAttemptsRemaining: number;
	runtimeAttemptsRemaining: number;
	lastDiagnostics: PluginDevelopmentDiagnostic[];
	lastTest?: PluginDevelopmentTestResult;
	updatedAt: string;
};

export type PluginProfile = {
	id: string;
	name: string;
	pluginIds: string[];
	active: boolean;
	updatedAt: string;
};

export type PluginCatalogResult = {
	plugins: PluginRecord[];
	profiles: PluginProfile[];
	activeProfile: PluginProfile;
};

export type PluginScanResult = {
	packageName: string;
	version: string;
	manifest: Record<string, unknown>;
	manifestHash: string;
	contentHash: string;
	compatibility: PluginCompatibility;
	presentation?: PluginPresentation;
	nativePlugin?: PluginRecord["nativePlugin"];
	p2?: PluginRecord["p2"];
	dependencyLockHash?: string;
};

export async function fetchPluginCatalog(): Promise<PluginCatalogResult> {
	const client = await createBackendClient();
	return client.request<PluginCatalogResult>("plugin.catalog.list", {});
}

export async function scanPlugin(
	source: PluginSource,
): Promise<PluginScanResult> {
	const client = await createBackendClient();
	return client.request<PluginScanResult>("plugin.scan", { source });
}

export async function installPlugin(
	source: PluginSource,
): Promise<{ plugin: PluginRecord; catalog: PluginCatalogResult }> {
	const client = await createBackendClient();
	return client.request<{
		plugin: PluginRecord;
		catalog: PluginCatalogResult;
	}>("plugin.install", { source });
}

export async function removePlugin(
	pluginId: string,
): Promise<PluginCatalogResult> {
	const client = await createBackendClient();
	return client.request<PluginCatalogResult>("plugin.remove", { pluginId });
}

export async function updatePluginTrust(
	pluginId: string,
	fingerprint: string,
	status: "trusted" | "disabled",
	reviewId?: string,
): Promise<{ plugin: PluginRecord; fingerprint: string }> {
	const client = await createBackendClient();
	return client.request<{ plugin: PluginRecord; fingerprint: string }>(
		"plugin.trust.update",
		{
			pluginId,
			fingerprint,
			status,
			...(reviewId === undefined ? {} : { reviewId }),
		},
	);
}

export async function deferPluginReview(
	reviewId: string,
	pluginId: string,
	fingerprint: string,
): Promise<{ resolved: true }> {
	const client = await createBackendClient();
	return client.request<{ resolved: true }>("plugin.review.resolve", {
		reviewId,
		pluginId,
		fingerprint,
		status: "deferred",
	});
}

export async function updatePluginProfile(
	pluginIds: string[],
): Promise<PluginCatalogResult> {
	const client = await createBackendClient();
	return client.request<PluginCatalogResult>("plugin.profile.update", {
		pluginIds,
	});
}

export async function fetchPluginRuntimeList(): Promise<{
	runtimes: PluginRuntimeSnapshot[];
}> {
	const client = await createBackendClient();
	return client.request("plugin.runtime.list", {});
}

export async function restartPluginRuntime(
	pluginId: string,
): Promise<PluginRuntimeSnapshot | null> {
	const client = await createBackendClient();
	return client.request("plugin.runtime.restart", { pluginId });
}

export async function stopPluginRuntime(
	pluginId: string,
): Promise<PluginRuntimeSnapshot | null> {
	const client = await createBackendClient();
	return client.request("plugin.runtime.disable", { pluginId });
}

export async function clearPluginRuntimeQuarantine(
	pluginId: string,
	sessionId?: string,
): Promise<PluginRuntimeSnapshot | null> {
	const client = await createBackendClient();
	return client.request("plugin.runtime.clear_quarantine", {
		pluginId,
		sessionId,
	});
}

export async function fetchPluginRuntimeLogs(
	pluginId?: string,
	limit?: number,
): Promise<PluginRuntimeLog[]> {
	const client = await createBackendClient();
	return client.request("plugin.runtime.logs.list", { pluginId, limit });
}

export async function installPluginDependencies(
	pluginId: string,
	allowNetwork: boolean,
): Promise<PluginRuntimeSnapshot> {
	const client = await createBackendClient();
	return client.request("plugin.runtime.dependencies.install", {
		pluginId,
		allowNetwork,
	});
}

export async function fetchPluginDevelopmentStatus(
	slug?: string,
): Promise<
	PluginDevelopmentStatus | { statuses: PluginDevelopmentStatus[] } | null
> {
	const client = await createBackendClient();
	return client.request(
		"plugin.development.status.get",
		slug === undefined ? {} : { slug },
	);
}
