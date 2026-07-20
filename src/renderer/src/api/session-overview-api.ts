import { createBackendClient } from "./backend-client";

export type SessionOverviewGitInfo = {
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
	kind: "image_attachment" | "generated_image";
	title: string;
	mimeType: string;
	createdAt: string;
	width?: number;
	height?: number;
	byteSize: number;
	thumbnailDataUrl: string;
};

export type SessionOverviewResult = {
	sessionId: string;
	envInfo: SessionOverviewGitInfo | null;
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
