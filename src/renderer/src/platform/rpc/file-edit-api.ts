import { createBackendClient } from "@/platform/rpc/transport/backend-client";

export type FileEditSnapshot = {
	path: string;
	sourceFolderId?: string;
	existedBefore: boolean;
	existsAfter: boolean;
	beforeText?: string;
	afterText?: string;
	additions: number;
	deletions: number;
	unavailableReason?: string;
};

export type FileEditBatchDetail = {
	fileEditBatch: {
		batchId: string;
		sessionId: string;
		edits: FileEditSnapshot[];
	};
};

export async function fetchFileEditBatch(sessionId: string, batchId: string): Promise<FileEditBatchDetail> {
	const client = await createBackendClient();
	return client.request<FileEditBatchDetail>("fileEdit.batch.get", { sessionId, batchId });
}
