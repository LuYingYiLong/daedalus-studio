import { createBackendClient } from "./backend-client";

export type GeneratedImageArtifact = {
	imageId: string;
	sessionId: string;
	mimeType: string;
	width?: number;
	height?: number;
	byteSize: number;
	provider: string;
	model: string;
	prompt: string;
	revisedPrompt?: string;
	createdAt: string;
	fileName: string;
};

export type GeneratedImageDataResult = {
	imageId: string;
	mimeType: string;
	dataUrl: string;
	metadata: GeneratedImageArtifact;
};

export async function fetchGeneratedImageDataUrl(sessionId: string, imageId: string): Promise<GeneratedImageDataResult> {
	const client = await createBackendClient();

	return client.request<GeneratedImageDataResult>("attachment.image.generated.get", {
		sessionId,
		imageId
	});
}
