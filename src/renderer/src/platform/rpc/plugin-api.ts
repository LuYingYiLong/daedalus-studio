import { createBackendClient } from "@/platform/rpc/transport/backend-client";

export type PluginSource =
	| { type: "local"; path: string }
	| { type: "tarball"; path: string; sha256: string }
	| { type: "npm"; packageName: string; version: string }
	| { type: "git"; url: string; commit: string };

export type PluginCompatibility = {
	daedalus: "native" | "unknown";
	harnessBundle: boolean;
	harnessClient: boolean;
	patchPath?: string;
	patchExists: boolean;
	entryPaths: string[];
	unsupportedFeatures: string[];
	warnings: string[];
	classification: "native" | "harness-bundle" | "harness-client" | "both" | "metadata-only" | "unsupported";
};

export type PluginPresentation = {
	description?: string;
	readme?: string;
	changelog?: string;
	iconDataUrl?: string;
};

export type HarnessRuntimeStatus =
	| "unconfigured"
	| "detected"
	| "needs_setup"
	| "ready"
	| "running"
	| "failed"
	| "disabled";

export type HarnessBundleSummary = {
	patchPath?: string;
	totalRows: number;
	bridgeableRows: number;
	skippedRows: Array<{ index: number; id?: string; name?: string; reason: string }>;
	operations: Array<"insert" | "replace" | "override">;
	warnings: string[];
	dangerousConstructs: string[];
	contentHash: string;
};

export type HarnessRuntimeConfig = {
	enabled: boolean;
	executablePath: string | null;
	sourceRoot: string | null;
	launchMode: "installed" | "source";
	bridgeProtocolVersion: number;
	network: "disabled";
	revision: string;
	updatedAt: string;
};

export type HarnessInstallationStatus = {
	status: "unconfigured" | "detected" | "needs_setup" | "failed";
	launchMode: "installed" | "source";
	version?: string;
	bridgeProtocolVersion: number;
	bridgeCompatible: boolean;
	dependenciesReady: boolean;
	error?: string;
};

export type HarnessConfigResult = {
	config: HarnessRuntimeConfig;
	installation: HarnessInstallationStatus;
	trustInvalidated?: boolean;
};

export type HarnessConfigDraft = Pick<HarnessRuntimeConfig, "enabled" | "executablePath" | "sourceRoot" | "launchMode">;

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
	nativePlugin?: { apiVersion: number; entry: string; capabilities: Array<"tools" | "skills" | "hooks" | "mcp"> };
	p2?: {
		apiVersion: number;
		capabilities: Record<string, number | undefined>;
		declarations: Record<string, unknown>;
	};
	dependencyLockHash?: string;
	harnessBundle?: HarnessBundleSummary;
	runtime?: PluginRuntimeSnapshot;
	isolation?: PluginRuntimeSnapshot["isolation"];
};

export type PluginRuntimeSnapshot = {
	pluginId: string;
	runtimeKind?: "native" | "harness";
	status: "stopped" | "starting" | "ready" | "failed" | "disabled" | "quarantined";
	activeSessions: number;
	registeredTools: number;
	registeredSkills: number;
	registeredHooks: number;
	registeredMcpServers: number;
	dependencyStatus: "not_required" | "pending" | "ready" | "needs_network" | "failed";
	harnessStatus?: HarnessRuntimeStatus;
	harnessVersion?: string;
	bridgeProtocolVersion?: number;
	bundleSummary?: HarnessBundleSummary;
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

export type PluginVersionRecord = {
	fingerprint: string;
	packageRoot: string;
	packageName: string;
	version: string;
	contentHash: string;
	manifestHash: string;
	installedAt: string;
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
	harnessBundle?: PluginRecord["harnessBundle"];
};

export async function fetchPluginCatalog(): Promise<PluginCatalogResult> {
	const client = await createBackendClient();
	return client.request<PluginCatalogResult>("plugin.catalog.list", {});
}

export async function scanPlugin(source: PluginSource): Promise<PluginScanResult> {
	const client = await createBackendClient();
	return client.request<PluginScanResult>("plugin.scan", { source });
}

export async function installPlugin(source: PluginSource): Promise<{ plugin: PluginRecord; catalog: PluginCatalogResult }> {
	const client = await createBackendClient();
	return client.request<{ plugin: PluginRecord; catalog: PluginCatalogResult }>("plugin.install", { source });
}

export async function removePlugin(pluginId: string): Promise<PluginCatalogResult> {
	const client = await createBackendClient();
	return client.request<PluginCatalogResult>("plugin.remove", { pluginId });
}

export async function updatePluginTrust(pluginId: string, fingerprint: string, status: "trusted" | "disabled"): Promise<{ plugin: PluginRecord; fingerprint: string }> {
	const client = await createBackendClient();
	return client.request<{ plugin: PluginRecord; fingerprint: string }>("plugin.trust.update", { pluginId, fingerprint, status });
}

export async function updatePluginProfile(pluginIds: string[]): Promise<PluginCatalogResult> {
	const client = await createBackendClient();
	return client.request<PluginCatalogResult>("plugin.profile.update", { pluginIds });
}

export async function updatePlugin(pluginId: string, source: PluginSource, expectedFingerprint: string): Promise<PluginRecord> {
	const client = await createBackendClient();
	return client.request<PluginRecord>("plugin.update.install", { pluginId, source, expectedFingerprint });
}

export async function fetchPluginVersions(pluginId: string): Promise<PluginVersionRecord[]> {
	const client = await createBackendClient();
	return client.request<PluginVersionRecord[]>("plugin.versions.list", { pluginId });
}

export async function rollbackPlugin(pluginId: string, fingerprint: string): Promise<PluginRecord> {
	const client = await createBackendClient();
	return client.request<PluginRecord>("plugin.rollback", { pluginId, fingerprint });
}

export async function fetchPluginRuntimeList(): Promise<{ runtimes: PluginRuntimeSnapshot[] }> {
	const client = await createBackendClient();
	return client.request("plugin.runtime.list", {});
}

export async function restartPluginRuntime(pluginId: string): Promise<PluginRuntimeSnapshot | null> {
	const client = await createBackendClient();
	return client.request("plugin.runtime.restart", { pluginId });
}

export async function stopPluginRuntime(pluginId: string): Promise<PluginRuntimeSnapshot | null> {
	const client = await createBackendClient();
	return client.request("plugin.runtime.disable", { pluginId });
}

export async function clearPluginRuntimeQuarantine(pluginId: string, sessionId?: string): Promise<PluginRuntimeSnapshot | null> {
	const client = await createBackendClient();
	return client.request("plugin.runtime.clear_quarantine", { pluginId, sessionId });
}

export async function fetchPluginRuntimeLogs(pluginId?: string, limit?: number): Promise<PluginRuntimeLog[]> {
	const client = await createBackendClient();
	return client.request("plugin.runtime.logs.list", { pluginId, limit });
}

export async function installPluginDependencies(pluginId: string, allowNetwork: boolean): Promise<PluginRuntimeSnapshot> {
	const client = await createBackendClient();
	return client.request("plugin.runtime.dependencies.install", { pluginId, allowNetwork });
}

export async function fetchHarnessConfig(): Promise<HarnessConfigResult> {
	const client = await createBackendClient();
	return client.request("plugin.harness.config.get", {});
}

export async function updateHarnessConfig(params: {
	expectedRevision: string;
	enabled: boolean;
	executablePath: string | null;
	sourceRoot: string | null;
	launchMode: "installed" | "source";
}): Promise<HarnessConfigResult> {
	const client = await createBackendClient();
	return client.request("plugin.harness.config.update", params);
}

export async function detectHarness(draft?: HarnessConfigDraft): Promise<HarnessConfigResult> {
	const client = await createBackendClient();
	return client.request("plugin.harness.detect", draft === undefined ? {} : { draft });
}

export async function previewHarnessBundle(pluginId: string): Promise<HarnessBundleSummary> {
	const client = await createBackendClient();
	return client.request("plugin.harness.preview", { pluginId });
}

export async function fetchHarnessRuntimeStatus(pluginId: string): Promise<{ runtime: PluginRuntimeSnapshot | null; installation: HarnessInstallationStatus }> {
	const client = await createBackendClient();
	return client.request("plugin.harness.runtime.status", { pluginId });
}
