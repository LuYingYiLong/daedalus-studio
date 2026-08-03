import { createBackendClient } from "@/shared/api/transport/backend-client";

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
};

export async function fetchSessionOverview(params: FetchSessionOverviewParams): Promise<SessionOverviewResult> {
	const client = await createBackendClient();

	return client.request<SessionOverviewResult>("session.overview.get", params);
}
