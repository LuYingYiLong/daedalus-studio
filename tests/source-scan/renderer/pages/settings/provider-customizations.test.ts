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
		expect(pageSource).toContain('mode="multiple"');
		expect(pageSource).toContain("readOnly={modelDialogMode === \"edit\"}");
		expect(pageSource).toContain("onRow={(model: ProviderModelInfo)");
		expect(pageSource).toContain("forceRender={true}");
		expect(pageSource).toContain("result.providers[0]?.provider ?? result.activeModel.providerId");
		expect(pageSource).toContain("id: model.id");
		expect(pageSource).toContain("displayName: model.displayName");
		expect(pageSource).toContain("getEditableCapabilities(model.capabilities)");
		expect(pageSource).toContain('name="capabilities"');
		expect(pageSource).toContain('hidden={modelDialogMode !== "edit"}');
		expect(pageSource).not.toContain("getModelTokenText");
		expect(pageSource).not.toContain("model.contextWindowTokens");
		expect(pageSource).not.toContain("model.maxOutputTokens");
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
});
