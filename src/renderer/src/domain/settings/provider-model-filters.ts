import type { ProviderModelInfo } from "@/platform/rpc/provider-api";

export function isVisionModel(model: ProviderModelInfo): boolean {
	return model.capabilities.imageInput === true;
}

export function isImageTaskModel(model: ProviderModelInfo): boolean {
	return model.capabilities.imageGeneration === true || model.capabilities.imageEdit === true;
}

export function isVideoTaskModel(model: ProviderModelInfo): boolean {
	return model.capabilities.videoGeneration === true || model.capabilities.videoEdit === true;
}
