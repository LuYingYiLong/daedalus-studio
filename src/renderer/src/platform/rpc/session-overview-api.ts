import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type {
	WorkspaceConfig,
	WorkspaceSourceFolder,
} from "@/platform/rpc/types";
import {
	fetchWorkspaceGitDiffSummary,
	type WorkspaceGitDiffSummaryResult,
} from "@/platform/rpc/workspace-git-diff-api";
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
	kind: "image_attachment" | "generated_image" | "text_attachment";
	title: string;
	mimeType: string;
	createdAt: string;
	width?: number;
	height?: number;
	byteSize: number;
	thumbnailDataUrl?: string;
	textPreview?: string;
};

export type SessionOverviewResult = {
	sessionId: string;
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
	if (source.kind === "generated_image") {
		return (await fetchGeneratedImageDataUrl(sessionId, source.id)).dataUrl;
	}
	if (source.kind === "image_attachment") {
		return (await fetchImageAttachmentDataUrl(source.id)).dataUrl;
	}
	throw new Error("Text sources do not have image data.");
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
