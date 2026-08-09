import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Provider request configuration", () => {
	it("uses a controlled JSON editor and persists request extensions through provider.config.set", () => {
		const apiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "provider-api.ts");
		const domainSource: string = readRepoFile("src", "renderer", "src", "domain", "settings", "provider-request-overrides.ts");
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "ProviderSettingsPage.tsx");
		const modalSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "ProviderRequestConfigModal.tsx");

		expect(apiSource).toContain("ProviderRequestOverrides");
		expect(apiSource).toContain("requestOverrides?: ProviderRequestOverrides | null | undefined");
		expect(pageSource).toContain("ProviderRequestConfigModal");
		expect(pageSource).toContain("setIsRequestConfigOpen(true)");
		expect(pageSource).toContain("requestOverrides: value");
		expect(modalSource).toContain('from "vanilla-jsoneditor"');
		expect(modalSource).toContain("createJSONEditor");
		expect(modalSource).toContain("editor.destroy()");
		expect(modalSource).toContain("parseProviderRequestOverrides");
		expect(domainSource).toContain('key !== "headers" && key !== "body"');
		expect(modalSource).not.toContain("svelte-jsoneditor");
	});
});
