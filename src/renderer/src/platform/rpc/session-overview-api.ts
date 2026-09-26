import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type {
	WorkspaceConfig,
	WorkspaceSourceFolder,
} from "@/platform/rpc/types";
import {
	fetchWorkspaceGitDiffSummary,
	type WorkspaceGitDiffSummaryResult,
} from "@/platform/rpc/workspace-git-diff-api";
import { listFlowGeneratedArtifacts, previewFlowArtifact, thumbnailFlowArtifact } from "@/platform/rpc/flow-api";
import { fetchGeneratedImageDataUrl } from "@/platform/rpc/generated-image-api";
import { fetchImageAttachmentDataUrl } from "@/platform/rpc/image-attachment-api";

export type SessionOverviewGitInfo = {
	sourceFolderId: string;
	sourceFolderPath: string;
	title: string;
	hasGitRepository: boolean;
	branch: string | null;
	additions: number;
	deletions: number;
	changedFiles: number;
};

export type SessionOverviewPlanItem = {
	planId: string;
	title: string;
	status: string;
	updatedAt: string;
	planPath: string;
	previewMarkdown: string;
};

export type SessionOverviewSourceItem = {
	id: string;
	kind: "image_attachment" | "generated_image" | "text_attachment" | "flow_media_artifact";
	title: string;
	mimeType: string;
	createdAt: string;
	width?: number;
	height?: number;
	byteSize: number;
	thumbnailDataUrl?: string;
	textPreview?: string;
	flowId?: string;
	runId?: string;
	nodeId?: string;
	provider?: string;
	model?: string;
	generationType?: string;
	prompt?: string;
	negativePrompt?: string;
	inputArtifactIds?: string[];
	durationMs?: number;
	fps?: number;
};

export type SessionOverviewResult = {
	sessionId: string;
	flowId?: string;
	envInfo: SessionOverviewGitInfo | null;
	envInfos?: SessionOverviewGitInfo[];
	plans: {
		total: number;
		items: SessionOverviewPlanItem[];
	};
	sources: {
		total: number;
		items: SessionOverviewSourceItem[];
	};
};

export type FetchSessionOverviewParams = {
	sessionId: string;
	planLimit?: number;
	sourceLimit?: number;
	includePlanPreviews?: boolean;
	includeSourceImages?: boolean;
};

export async function fetchSessionOverview(
	params: FetchSessionOverviewParams,
): Promise<SessionOverviewResult> {
	const client = await createBackendClient();

	return client.request<SessionOverviewResult>(
		"session.overview.get",
		params,
	);
}

export async function fetchSessionOverviewSourceImageDataUrl(
	sessionId: string,
	source: Pick<SessionOverviewSourceItem, "id" | "kind">,
): Promise<string> {
	if (source.kind === "flow_media_artifact") {
		const { dataBase64 } = await thumbnailFlowArtifact(source.id);
		return `data:image/png;base64,${dataBase64}`;
	}
	if (source.kind === "generated_image") {
		return (await fetchGeneratedImageDataUrl(sessionId, source.id)).dataUrl;
	}
	if (source.kind === "image_attachment") {
		return (await fetchImageAttachmentDataUrl(source.id)).dataUrl;
	}
	throw new Error("Text sources do not have image data.");
}

export async function fetchFlowOverviewSourcePreviewDataUrl(source: Pick<SessionOverviewSourceItem, "id" | "mimeType" | "kind">): Promise<string> {
	if (source.kind !== "flow_media_artifact") throw new Error("Source is not a Flow artifact.");
	const { dataBase64 } = await previewFlowArtifact(source.id);
	return `data:${source.mimeType};base64,${dataBase64}`;
}

function getPathBasename(inputPath: string): string {
	return inputPath.split(/[\\/]/u).filter(Boolean).at(-1) ?? inputPath;
}

export async function fetchWorkspaceOverview(
	workspace: WorkspaceConfig,
): Promise<SessionOverviewResult> {
	const sourceFolders: WorkspaceSourceFolder[] =
		workspace.sourceFolders.length > 0
			? workspace.sourceFolders
			: [
					{
						id: workspace.primarySourceFolderId || "primary",
						path: workspace.rootPath,
						capabilities: {
							git: false,
							godot: workspace.kind === "godot",
						},
					},
				];
	const envInfos: Array<SessionOverviewGitInfo | null> = await Promise.all(
		sourceFolders.map(
			async (
				sourceFolder: WorkspaceSourceFolder,
			): Promise<SessionOverviewGitInfo | null> => {
				try {
					const gitSummary: WorkspaceGitDiffSummaryResult =
						await fetchWorkspaceGitDiffSummary({
							workspaceId: workspace.id,
							sourceFolderId: sourceFolder.id,
							cursor: 0,
							limit: 1,
						});
					if (!gitSummary.hasGitRepository) {
						return null;
					}
					return {
						sourceFolderId: sourceFolder.id,
						sourceFolderPath: sourceFolder.path,
						title: getPathBasename(sourceFolder.path),
						hasGitRepository: true,
						branch: gitSummary.branch,
						additions: gitSummary.additions,
						deletions: gitSummary.deletions,
						changedFiles: gitSummary.changedFiles,
					};
				} catch (error: unknown) {
					console.error(
						"[session-overview-api] failed to load workspace source folder summary",
						{
							workspaceId: workspace.id,
							sourceFolderId: sourceFolder.id,
							error,
						},
					);
					return null;
				}
			},
		),
	);
	const availableEnvInfos: SessionOverviewGitInfo[] = envInfos.filter(
		(
			envInfo: SessionOverviewGitInfo | null,
		): envInfo is SessionOverviewGitInfo => envInfo !== null,
	);

	return {
		sessionId: "",
		envInfo: availableEnvInfos[0] ?? null,
		envInfos: availableEnvInfos,
		plans: { total: 0, items: [] },
		sources: { total: 0, items: [] },
	};
}

export async function fetchFlowOverview(params: {
	flowId: string;
	workspace: WorkspaceConfig | null;
	sourceLimit?: number;
}): Promise<SessionOverviewResult> {
	const base: SessionOverviewResult = params.workspace === null
		? { sessionId: "", envInfo: null, envInfos: [], plans: { total: 0, items: [] }, sources: { total: 0, items: [] } }
		: await fetchWorkspaceOverview(params.workspace);
	const limit = Math.max(1, Math.min(params.sourceLimit ?? 3, 500));
	const { artifacts, total } = await listFlowGeneratedArtifacts(params.flowId, limit);
	const sources: SessionOverviewSourceItem[] = artifacts.flatMap((artifact): SessionOverviewSourceItem[] => {
		if (!artifact.mimeType.startsWith("image/") && !artifact.mimeType.startsWith("video/")) return [];
		const provenance = artifact.metadata.provenance;
		if (provenance === null || typeof provenance !== "object" || Array.isArray(provenance)) return [];
		const source = provenance as Record<string, unknown>;
		if (source.kind !== "ai-generation") return [];
		const provider = typeof source.provider === "string" ? source.provider : undefined;
		const model = typeof source.model === "string" ? source.model : undefined;
		const prompt = typeof source.prompt === "string" ? source.prompt : undefined;
		const negativePrompt = typeof source.negativePrompt === "string" ? source.negativePrompt : undefined;
		return [{
			id: artifact.artifactId,
			kind: "flow_media_artifact",
			title: prompt?.trim() || [provider, model].filter(Boolean).join(" · ") || artifact.mimeType,
			mimeType: artifact.mimeType,
			createdAt: artifact.createdAt,
			byteSize: artifact.byteSize,
			...(artifact.width === undefined ? {} : { width: artifact.width }),
			...(artifact.height === undefined ? {} : { height: artifact.height }),
			flowId: artifact.flowId,
			...(artifact.runId === null ? {} : { runId: artifact.runId }),
			nodeId: artifact.nodeId,
			...(provider === undefined ? {} : { provider }),
			...(model === undefined ? {} : { model }),
			...(typeof source.generationType === "string" ? { generationType: source.generationType } : {}),
			...(prompt === undefined ? {} : { prompt }),
			...(negativePrompt === undefined ? {} : { negativePrompt }),
			...(Array.isArray(source.inputArtifactIds) ? { inputArtifactIds: source.inputArtifactIds.filter((id): id is string => typeof id === "string") } : {}),
			...(artifact.durationMs === undefined ? {} : { durationMs: artifact.durationMs }),
			...(artifact.fps === undefined ? {} : { fps: artifact.fps }),
		}];
	});
	return {
		...base,
		flowId: params.flowId,
		sources: { total, items: sources },
	};
}
