import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("SettingsItem", () => {
	it("provides the shared title, description, and control layout for settings pages", () => {
		const componentSource: string = readRepoFile("src", "renderer", "src", "components", "SettingsItem.tsx");
		const cssSource: string = readRepoFile("src", "renderer", "src", "components", "SettingsItem.module.css");
		const generalPageSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "GeneralSettingsPage.tsx");
		const searchPageSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "SearchSettingsPage.tsx");

		expect(componentSource).toContain("title: ReactNode;");
		expect(componentSource).toContain("description: ReactNode;");
		expect(componentSource).toContain("children: ReactNode;");
		expect(componentSource).toContain("<Typography.Text strong>{title}</Typography.Text>");
		expect(componentSource).toContain('<Typography.Text type="secondary" className={styles.description}>{description}</Typography.Text>');
		expect(cssSource).toContain("grid-template-columns: minmax(0, 1fr) minmax(0, max-content);");
		expect(cssSource).toContain(".item + .item");
		expect(generalPageSource).toContain('import SettingsItem from "@/components/SettingsItem";');
		expect(searchPageSource).toContain('import SettingsItem from "@/components/SettingsItem";');
	});
});
