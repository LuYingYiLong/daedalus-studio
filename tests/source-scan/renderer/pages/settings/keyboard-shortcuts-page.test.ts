import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("KeyboardShortcutsSettingsPage", () => {
	it("registers the settings page and renders controlled Ant Design inputs, table, and editor", () => {
		const settingsWindow: string = readRepoFile("src", "renderer", "src", "app", "shell", "SettingsWindow.tsx");
		const page: string = readRepoFile(
			"src",
			"renderer",
			"src",
			"widgets",
			"settings",
			"KeyboardShortcutsSettingsPage.tsx"
		);
		const motionCssSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "components", "SettingsPageMotion.module.css");
		const main: string = readRepoFile("src", "main", "index.ts");

		expect(settingsWindow).toContain('"keyboard_shortcuts"');
		expect(settingsWindow).toContain('name="keyboard"');
		expect(main).toContain('"keyboard_shortcuts"');
		expect(page).toContain("<Table<ShortcutDefinition>");
		expect(page).toContain("pageMotionStyles.enter");
		expect(motionCssSource).toContain("animation: settingsPageContentEnter 160ms ease-out both;");
		expect(page).toContain('rowKey="id"');
		expect(page).toContain("pagination={false}");
		expect(page).toContain("onRow={(definition: ShortcutDefinition)");
		expect(page).toContain('event.key === "Enter" || event.key === " "');
		expect(page).toContain("event.stopPropagation()");
		expect(page).toContain("<Modal");
		expect(page).toContain("destroyOnHidden={true}");
		expect(page).toContain("mask={{ closable:");
		expect(page).not.toContain("maskClosable");
	});
});
