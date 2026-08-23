import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Hooks settings integration", () => {
	it("registers the Hooks page and uses the dedicated icon", (): void => {
		const source: string = readRepoFile("src", "renderer", "src", "app", "shell", "SettingsWindow.tsx");
		expect(source).toContain('import HooksSettingsPage from "@/widgets/settings/HooksSettingsPage"');
		expect(source).toContain('{ key: "hooks", labelKey: "settings.menu.hooks", icon: <Icon name="hook" /> }');
		expect(source).toContain('return <HooksSettingsPage />');
	});

	it("keeps trust review explicit after saving", (): void => {
		const source: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "HooksSettingsPage.tsx");
		expect(source).toContain("if (updated.handlers.length > 0) setReviewOpen(true)");
		expect(source).toContain("updateHookTrust(");
		expect(source).toContain("toTarget(document)");
		expect(source).toContain('mask={{ closable: false }}');
		expect(source).toContain("if (document !== null) setContent(document.content)");
		expect(source).toContain("onOk: discardEditorChanges");
	});

	it("reuses the shared Monaco editor lifecycle", (): void => {
		const adapter: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "HooksJsonEditor.tsx");
		expect(adapter).toContain('from "@/widgets/files/MonacoFileEditor"');
		const source: string = readRepoFile("src", "renderer", "src", "widgets", "files", "MonacoFileEditor.tsx");
		expect(source).toContain("editorRef.current?.dispose()");
		expect(source).toContain("model.dispose()");
	});
});
