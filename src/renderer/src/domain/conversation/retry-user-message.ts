import type { AdditionalContextItem } from "@/platform/rpc/types";

export type RetryUserMessagePayload = {
	requestId: string;
	message: string;
	additionalContext: AdditionalContextItem[];
};
