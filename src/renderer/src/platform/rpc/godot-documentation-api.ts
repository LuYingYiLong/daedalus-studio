import { createBackendClient } from "@/platform/rpc/transport/backend-client";

export type GodotDocumentationRecord = {
	id: string;
	branch: string;
	commitSha: string;
	source: "official" | "local";
	sourcePath?: string;
	sourceRef: {
		kind: "official_zip" | "local_zip" | "local_tree";
		sha256: string;
		sizeBytes: number;
	} | null;
	activeGenerationId: string | null;
	health: {
		status: "checking" | "ready" | "degraded" | "repairing" | "unavailable";
		code: string | null;
		message: string | null;
		checkedAt: string | null;
	};
	repairAvailability:
		| "rollback"
		| "cached_source"
		| "network_required"
		| "source_required"
		| "none";
	installedAt: string;
	updatedAt: string;
	documentCount: number;
	chunkCount: number;
	classCount: number;
	sizeBytes: number;
};

export type GodotDocumentationJobStage =
	| "resolving"
	| "downloading"
	| "extracting"
	| "indexing"
	| "validating"
	| "rolling_back"
	| "finalizing"
	| "completed"
	| "failed"
	| "cancelled";

export type GodotDocumentationJob = {
	jobId: string;
	operation: "install" | "update" | "import" | "check" | "repair";
	branch: string;
	documentId: string | null;
	stage: GodotDocumentationJobStage;
	progress: number | null;
	message: string;
	error: string | null;
	startedAt: string;
	updatedAt: string;
	completedAt: string | null;
	unchanged: boolean;
};

export type GodotDocumentationState = {
	schemaVersion: 2;
	enabled: boolean;
	documents: GodotDocumentationRecord[];
	activeJob: GodotDocumentationJob | null;
};

export type GodotDocumentationBranch = {
	name: string;
	commitSha: string;
	installed: boolean;
};

export type GodotDocumentationBranchList = {
	branches: GodotDocumentationBranch[];
	recommendedBranch: string | null;
	stale: boolean;
	error?: string;
};

export async function fetchGodotDocumentation(): Promise<GodotDocumentationState> {
	const client = await createBackendClient();
	return client.request<GodotDocumentationState>("godotDocumentation.get");
}

export async function fetchGodotDocumentationBranches(
	refresh: boolean = false,
): Promise<GodotDocumentationBranchList> {
	const client = await createBackendClient();
	return client.request<GodotDocumentationBranchList>(
		"godotDocumentation.branches.list",
		{ refresh },
	);
}

export async function installGodotDocumentation(
	branch: string,
): Promise<GodotDocumentationJob> {
	const client = await createBackendClient();
	return client.request<GodotDocumentationJob>("godotDocumentation.install", {
		branch,
	});
}

export async function importLocalGodotDocumentation(
	branch: string,
	sourcePath: string,
): Promise<GodotDocumentationJob> {
	const client = await createBackendClient();
	return client.request<GodotDocumentationJob>(
		"godotDocumentation.importLocal",
		{ branch, sourcePath },
	);
}

export async function updateGodotDocumentation(
	documentId: string,
): Promise<GodotDocumentationJob> {
	const client = await createBackendClient();
	return client.request<GodotDocumentationJob>("godotDocumentation.update", {
		documentId,
	});
}

export async function checkGodotDocumentationHealth(
	documentId: string,
	deep: boolean = true,
): Promise<GodotDocumentationJob> {
	const client = await createBackendClient();
	return client.request<GodotDocumentationJob>(
		"godotDocumentation.health.check",
		{ documentId, deep },
	);
}

export async function repairGodotDocumentation(
	documentId: string,
	allowNetwork: boolean,
): Promise<GodotDocumentationJob> {
	const client = await createBackendClient();
	return client.request<GodotDocumentationJob>("godotDocumentation.repair", {
		documentId,
		allowNetwork,
	});
}

export async function removeGodotDocumentation(
	documentId: string,
): Promise<GodotDocumentationState> {
	const client = await createBackendClient();
	return client.request<GodotDocumentationState>(
		"godotDocumentation.remove",
		{ documentId },
	);
}

export async function setGodotDocumentationEnabled(
	enabled: boolean,
): Promise<GodotDocumentationState> {
	const client = await createBackendClient();
	return client.request<GodotDocumentationState>(
		"godotDocumentation.setEnabled",
		{ enabled },
	);
}

export async function fetchGodotDocumentationJob(
	jobId: string,
): Promise<GodotDocumentationJob | null> {
	const client = await createBackendClient();
	return client.request<GodotDocumentationJob | null>(
		"godotDocumentation.job.get",
		{ jobId },
	);
}

export async function cancelGodotDocumentationJob(
	jobId: string,
): Promise<GodotDocumentationJob | null> {
	const client = await createBackendClient();
	return client.request<GodotDocumentationJob | null>(
		"godotDocumentation.job.cancel",
		{ jobId },
	);
}
