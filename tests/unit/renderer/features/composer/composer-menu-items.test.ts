import { describe, expect, it } from "vitest";
import type { MenuProps } from "antd";
import type {
	ProviderModelSelection,
	ProviderReasoningEffortOption,
} from "@/platform/rpc/provider-api";
import {
	createComposerOptionsItems,
	createModelKey,
	createProviderModelAndReasoningItems,
	createReasoningEffortKey,
	parseReasoningEffortKey,
} from "@/widgets/composer/composer-menu-items";

type MenuObject = {
	children?: unknown;
	key?: unknown;
	type?: unknown;
};

const translate = ((key: string): string => key) as never;

function getMenuObjects(items: MenuProps["items"]): MenuObject[] {
	return (items ?? [])
		.filter((item): boolean => item !== null && typeof item === "object")
		.map((item): MenuObject => item as MenuObject);
}

function getKeys(items: MenuProps["items"]): string[] {
	return getMenuObjects(items)
		.map((item): string | null =>
			item.key === undefined ? null : String(item.key),
		)
		.filter((key): key is string => key !== null);
}

const reasoningEffortOptions: ProviderReasoningEffortOption[] = [
	{ id: "low", fallback: "low" },
	{ id: "medium", fallback: "medium", default: true },
	{ id: "high", fallback: "high" },
];

const providerSelection: ProviderModelSelection = {
	activeModel: { providerId: "deepseek", modelId: "deepseek-v4" },
	current: {
		provider: "deepseek",
		displayName: "DeepSeek",
		configured: true,
		model: "deepseek-v4",
		modelDisplayName: "DeepSeek V4",
		baseUrl: "https://api.example.test",
		apiKeyMasked: "****",
	},
	providers: [
		{
			provider: "deepseek",
			displayName: "DeepSeek",
			configured: true,
			selected: true,
			selectedModel: "deepseek-v4",
			selectedModelDisplayName: "DeepSeek V4",
			defaultModel: "deepseek-v4",
			baseUrl: "https://api.example.test",
			custom: false,
			providerType: "openai-responses",
			ready: true,
			apiKeyMasked: "****",
			modelsSource: "fallback",
			models: [
				{
					id: "deepseek-v4",
					displayName: "DeepSeek V4",
					provider: "deepseek",
					endpointType: "openai-responses",
					contextWindowTokens: 128000,
					maxOutputTokens: 8192,
					capabilities: {
						reasoning: true,
						reasoningEfforts: reasoningEffortOptions,
					},
				},
			],
		},
	],
	modelRouting: {
		imageRecognition: null,
		sessionTitle: null,
		nextStepHints: null,
		imageGeneration: null,
		gitCommit: null,
		commandReview: null,
		goalEvaluator: null,
		contextCompression: null,
	},
};

describe("Composer toolbar menu items", () => {
	it("groups context actions and all allowed modes for Desktop", () => {
		const items = createComposerOptionsItems(translate, {
			includeContext: true,
			includeMode: true,
		});
		const groups = getMenuObjects(items);

		expect(getKeys(items)).toEqual(["context", "mode"]);
		expect(getKeys(groups[0]?.children as MenuProps["items"])).toEqual([
			"files",
			"folder",
			"images",
		]);
		expect(getKeys(groups[1]?.children as MenuProps["items"])).toEqual([
			"ask",
			"agent",
			"plan",
			"goal",
		]);
	});

	it("keeps Remote's plus menu to supported modes when context is unavailable", () => {
		const items = createComposerOptionsItems(translate, {
			includeContext: false,
			includeMode: true,
			allowedModes: ["ask", "agent", "plan"],
		});
		const groups = getMenuObjects(items);

		expect(getKeys(items)).toEqual(["mode"]);
		expect(getKeys(groups[0]?.children as MenuProps["items"])).toEqual([
			"ask",
			"agent",
			"plan",
		]);
	});

	it("adds reasoning effort to the model menu without colliding with model keys", () => {
		const items = createProviderModelAndReasoningItems(
			providerSelection,
			reasoningEffortOptions,
			translate,
		);
		const objects = getMenuObjects(items);
		const reasoningGroup = objects.find(
			(item): boolean => item.key === "reasoning-effort",
		);

		expect(getKeys(items)).toContain("reasoning-effort");
		expect(getKeys(reasoningGroup?.children as MenuProps["items"])).toEqual([
			"reasoning:low",
			"reasoning:medium",
			"reasoning:high",
		]);
		expect(createModelKey("deepseek", "deepseek-v4")).not.toBe(
			createReasoningEffortKey("deepseek-v4"),
		);
		expect(parseReasoningEffortKey("reasoning:high")).toBe("high");
		expect(parseReasoningEffortKey("model:deepseek:deepseek-v4")).toBeNull();
	});
});
