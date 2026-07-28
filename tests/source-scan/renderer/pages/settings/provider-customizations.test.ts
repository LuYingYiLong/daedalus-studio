import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Provider customizations", () => {
	it("uses backend RPC and controlled Ant Design dialogs for provider and model edits", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "ProviderSettingsPage.tsx");
		const apiSource: string = readRepoFile("src", "renderer", "src", "api", "provider-api.ts");

		expect(apiSource).toContain('"provider.custom.add"');
		expect(apiSource).toContain('"provider.model.add"');
		expect(apiSource).toContain('"provider.model.update"');
		expect(pageSource).toContain("destroyOnHidden={true}");
		expect(pageSource).toContain("preserve={false}");
		expect(pageSource).toContain('mode="multiple"');
		expect(pageSource).toContain("readOnly={modelDialogMode === \"edit\"}");
		expect(pageSource).toContain("onRow={(model: ProviderModelInfo)");
		expect(pageSource).toContain("afterOpenChange={handleModelDialogOpenChange}");
		expect(pageSource).toContain('if (modelDialogMode === "edit" && editingModel !== null)');
		expect(pageSource).toContain("id: editingModel.id");
		expect(pageSource).toContain("displayName: editingModel.displayName");
		expect(pageSource).toContain("getEditableCapabilities(editingModel.capabilities)");
		expect(pageSource).not.toContain("getModelTokenText");
		expect(pageSource).not.toContain("model.contextWindowTokens");
		expect(pageSource).not.toContain("model.maxOutputTokens");
	});
});
