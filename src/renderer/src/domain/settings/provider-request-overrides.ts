import type { ProviderRequestJsonValue, ProviderRequestOverrides } from "@/platform/rpc/provider-api";

export type ProviderRequestOverridesParseResult =
	| { value: ProviderRequestOverrides; error: null }
	| { value: null; error: string };

export const EMPTY_PROVIDER_REQUEST_OVERRIDES: ProviderRequestOverrides = {
	headers: {},
	body: {}
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is ProviderRequestJsonValue {
	if (value === null || typeof value === "boolean" || typeof value === "string") {
		return true;
	}
	if (typeof value === "number") {
		return Number.isFinite(value);
	}
	if (Array.isArray(value)) {
		return value.every((item: unknown): boolean => isJsonValue(item));
	}
	return isRecord(value) && Object.values(value).every((item: unknown): boolean => isJsonValue(item));
}

export function cloneProviderRequestOverrides(value: ProviderRequestOverrides | undefined): ProviderRequestOverrides {
	if (value === undefined) {
		return { headers: {}, body: {} };
	}
	return JSON.parse(JSON.stringify(value)) as ProviderRequestOverrides;
}

export function parseProviderRequestOverrides(value: unknown): ProviderRequestOverridesParseResult {
	if (!isRecord(value)) {
		return { value: null, error: "settings.provider.requestConfiguration.validation.root" };
	}

	for (const key of Object.keys(value)) {
		if (key !== "headers" && key !== "body") {
			return { value: null, error: "settings.provider.requestConfiguration.validation.topLevel" };
		}
	}

	const headersValue: unknown = value.headers ?? {};
	if (!isRecord(headersValue) || Object.values(headersValue).some((header: unknown): boolean => typeof header !== "string")) {
		return { value: null, error: "settings.provider.requestConfiguration.validation.headers" };
	}

	const bodyValue: unknown = value.body ?? {};
	if (!isRecord(bodyValue) || !isJsonValue(bodyValue)) {
		return { value: null, error: "settings.provider.requestConfiguration.validation.body" };
	}

	return {
		value: {
			headers: Object.fromEntries(Object.entries(headersValue).map(([name, header]): [string, string] => [name, String(header)])),
			body: bodyValue as Record<string, ProviderRequestJsonValue>
		},
		error: null
	};
}
