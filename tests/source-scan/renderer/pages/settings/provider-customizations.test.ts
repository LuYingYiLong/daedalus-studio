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
		expect(pageSource).toContain("forceRender={true}");
		expect(pageSource).toContain("result.providers[0]?.provider ?? result.activeModel.providerId");
		expect(pageSource).toContain("id: model.id");
		expect(pageSource).toContain("displayName: model.displayName");
		expect(pageSource).toContain("getEditableCapabilities(model.capabilities)");
		expect(pageSource).not.toContain("getModelTokenText");
		expect(pageSource).not.toContain("model.contextWindowTokens");
		expect(pageSource).not.toContain("model.maxOutputTokens");
	});
});
