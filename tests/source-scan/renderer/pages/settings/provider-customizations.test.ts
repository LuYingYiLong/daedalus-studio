import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Provider customizations", () => {
	it("uses backend RPC and controlled Ant Design dialogs for provider and model edits", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "ProviderSettingsPage.tsx");
		const apiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "provider-api.ts");

		expect(apiSource).toContain('"provider.custom.add"');
		expect(apiSource).toContain('"provider.model.add"');
		expect(apiSource).toContain('"provider.model.update"');
		expect(pageSource).toContain("destroyOnHidden={true}");
		expect(pageSource).toContain("preserve={false}");
		expect(pageSource).toContain("readOnly={modelDialogMode === \"edit\"}");
		expect(pageSource).toContain("onRow={(model: ProviderModelInfo)");
		expect(pageSource).toContain("forceRender={true}");
		expect(pageSource).toContain("result.providers[0]?.provider ?? result.activeModel.providerId");
		expect(pageSource).toContain("id: model.id");
		expect(pageSource).toContain("displayName: model.displayName");
		expect(pageSource).toContain("createCapabilityFormValues(model, !isCustomModel)");
		expect(pageSource).toContain('["capabilities", capability.key]');
		expect(pageSource).toContain('name="contextWindowTokens"');
		expect(pageSource).toContain('name="maxOutputTokens"');
		expect(pageSource).toContain('value: "inherit"');
		expect(pageSource).toContain("createUniformCapabilityFormValues(\"inherit\")");
		expect(pageSource).toContain('<Form.List name="reasoningEfforts">');
		expect(pageSource).toContain("inheritReasoningEfforts");
		expect(pageSource).toContain("reasoningEffortFallback");
		expect(pageSource).toContain("reasoningEffortDefault");
		expect(apiSource).toContain("reasoningEfforts: ProviderReasoningEffortOption[] | null");
		expect(apiSource).toContain("contextWindowTokens: number");
		expect(apiSource).toContain("ProviderModelCustomizationInfo");
		expect(pageSource).not.toContain("getModelTokenText");
		expect(pageSource).toContain("model.contextWindowTokens");
		expect(pageSource).toContain("model.maxOutputTokens");
	});

	it("discovers models during the modal transition and synchronizes a controlled selection", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "ProviderSettingsPage.tsx");
		const apiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "provider-api.ts");

		expect(apiSource).toContain('"provider.models.discover"');
		expect(apiSource).toContain('"provider.models.import"');
		expect(apiSource).toContain('"provider.models.sync"');
		expect(pageSource).toContain("setIsDiscoveryOpen(true)");
		expect(pageSource).toContain("void loadDiscoveredModels(provider, false)");
		expect(pageSource).not.toContain("afterOpenChange");
		expect(pageSource).toContain("preserveSelectedRowKeys: true");
		expect(pageSource).toContain("disabled: model.removalGuards.length > 0");
		expect(pageSource).toContain("selectedRowKeys: selectedDiscoveredModelIds");
		expect(pageSource).toContain("confirmLoading={isImporting}");
		expect(pageSource).toContain("emptyText: isDiscovering ? null :");
		expect(pageSource).toContain("removeModelIds");
		expect(pageSource).toContain("enableModelIds");
		expect(pageSource).toContain("await modal.confirm");
		expect(pageSource).toContain("activate: false");
		expect(pageSource).toContain('result.source !== "api"');
		expect(pageSource).not.toContain("handleRefreshModels");
	});

	it("keeps credential saving independent from model discovery and exposes classified discovery guidance", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "ProviderSettingsPage.tsx");
		const apiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "provider-api.ts");

		expect(pageSource).toContain("handleSaveCredentials");
		expect(pageSource).toContain("createCredentialSavePayload(provider)");
		expect(pageSource).toContain("credentialsSaved");
		expect(pageSource).toContain("getDiscoveryFailureMessage");
		expect(pageSource).toContain("manualModelHint");
		expect(pageSource).toContain("baseUrlHints.openaiCompatible");
		expect(pageSource).toContain("isOpenAICompatibleCustomProvider");
		expect(apiSource).toContain("ProviderModelDiscoveryFailureCode");
		expect(apiSource).toContain("failure?: ProviderModelDiscoveryFailure");
	});

	it("guards every provider disable and custom-provider removal with backend usage checks", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "ProviderSettingsPage.tsx");
		const apiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "provider-api.ts");

		expect(apiSource).toContain('"provider.setEnabled"');
		expect(apiSource).toContain('"provider.usage.get"');
		expect(apiSource).toContain('"provider.custom.remove"');
		expect(apiSource).toContain("ProviderModelUsage");
		expect(pageSource).toContain("setProviderEnabled");
		expect(pageSource).toContain("getProviderUsage");
		expect(pageSource).toContain("removeCustomProvider");
		expect(pageSource).toContain("showProviderUsageBlocked");
		expect(pageSource).toContain("result.usages");
		expect(pageSource).toContain("await modal.confirm");
		expect(pageSource).toContain("if (!provider.custom)");
		expect(pageSource).toContain("disabled={isProviderActionPending || !selectedProvider.custom}");
		expect(pageSource).toContain("selectedProvider.enabled !== false");
		expect(pageSource).toContain("providerEnableUnavailable");
		expect(pageSource).toContain("createCredentialSavePayload(provider, true)");
		expect(pageSource).toContain('{enabled ? <Tag color="success" className={styles.providerStatusTag}>{t("settings.common.on")}</Tag> : null}');
	});

	it("supports provider websites and custom provider editing", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "ProviderSettingsPage.tsx");
		const apiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "provider-api.ts");

		expect(apiSource).toContain('"provider.custom.update"');
		expect(apiSource).toContain("websiteUrl?: string | null | undefined");
		expect(pageSource).toContain("openEditProviderDialog");
		expect(pageSource).toContain("handleSaveProvider");
		expect(pageSource).toContain('name="websiteUrl"');
		expect(pageSource).toContain("openExternal(websiteUrl)");
		expect(pageSource).toContain("selectedProvider.websiteUrl !== undefined");
	});
});
