import { createBackendClient } from "./backend-client";
import type { PendingGuide, WorkbenchSnapshot } from "./types";

export type GuideResult = {
	guideAdded?: boolean;
	guideUpdated?: boolean;
	guideDeleted?: boolean;
	guideReordered?: boolean;
	duplicate?: boolean;
	guide?: PendingGuide;
	guideId?: string;
	pendingGuides: PendingGuide[];
	workbench: WorkbenchSnapshot;
};

export async function addGuide(text: string, anchorRequestId?: string): Promise<GuideResult> {
	const client = await createBackendClient();

	return client.request<GuideResult>("session.guide.add", {
		clientGuideId: `guide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
		text,
		anchorRequestId
	});
}

export async function updateGuide(guideId: string, text: string): Promise<GuideResult> {
	const client = await createBackendClient();

	return client.request<GuideResult>("session.guide.update", {
		guideId,
		text
	});
}

export async function deleteGuide(guideId: string): Promise<GuideResult> {
	const client = await createBackendClient();

	return client.request<GuideResult>("session.guide.delete", {
		guideId
	});
}

export async function reorderGuides(guideIds: string[]): Promise<GuideResult> {
	const client = await createBackendClient();

	return client.request<GuideResult>("session.guide.reorder", {
		guideIds
	});
}
