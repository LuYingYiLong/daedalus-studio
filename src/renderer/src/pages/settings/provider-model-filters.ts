import type { ProviderModelInfo } from "@/api/provider-api";

export function isImageTaskModel(model: ProviderModelInfo): boolean {
	return model.capabilities.imageGeneration === true || model.capabilities.imageEdit === true;
}
