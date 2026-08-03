import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Godot documentation settings", () => {
	const settingsWindowSource: string = readRepoFile("src", "renderer", "src", "app", "SettingsWindow.tsx");
	const pageSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"pages",
		"settings",
		"DocumentationSettingsPage.tsx"
	);
	const apiSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"api",
		"godot-documentation-api.ts"
	);
	const mainSource: string = readRepoFile("src", "main", "index.ts");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");

	it("places Documentation between Skills and Godot projects", () => {
		const skillsIndex: number = settingsWindowSource.indexOf('{ key: "skills"');
		const documentationIndex: number = settingsWindowSource.indexOf('{ key: "documentation"');
		const godotProjectsIndex: number = settingsWindowSource.indexOf('{ key: "godot_projects"');

		expect(skillsIndex).toBeGreaterThan(-1);
		expect(documentationIndex).toBeGreaterThan(skillsIndex);
		expect(godotProjectsIndex).toBeGreaterThan(documentationIndex);
		expect(settingsWindowSource).toContain("<DocumentationSettingsPage />");
		expect(mainSource).toContain('"documentation"');
	});

	it("keeps loading and empty states mutually exclusive", () => {
		expect(pageSource).toContain("isLoading ? (");
		expect(pageSource).toContain(") : documents.length === 0 ? (");
		expect(pageSource).toContain("destroyOnHidden={true}");
		expect(pageSource).toContain("preserve={false}");
		expect(pageSource).toContain("const { message, modal } = App.useApp()");
	});

	it("starts branch discovery from the open action and exposes job cancellation", () => {
		expect(pageSource).toContain('setModalMode("select")');
		expect(pageSource).toContain("void loadBranches(false)");
		expect(pageSource).toContain("cancelGodotDocumentationJob");
		expect(apiSource).toContain('"godotDocumentation.branches.list"');
		expect(apiSource).toContain('"godotDocumentation.job.cancel"');
	});

	it("imports local folders or ZIP archives through native path pickers", () => {
		expect(pageSource).toContain('setModalMode("local")');
		expect(pageSource).toContain('godotDocumentationFs.pickDirectory()');
		expect(pageSource).toContain('godotDocumentationFs.pickZip()');
		expect(pageSource).toContain("importLocalGodotDocumentation(values.branch, sourcePath)");
		expect(apiSource).toContain('"godotDocumentation.importLocal"');
		expect(mainSource).toContain("registerGodotDocumentationFsIpc");
		expect(preloadSource).toContain("godotDocumentationFs:");
	});

	it("exposes index health checks and explicit repair sources", () => {
		expect(apiSource).toContain('"godotDocumentation.health.check"');
		expect(apiSource).toContain('"godotDocumentation.repair"');
		expect(pageSource).toContain("checkGodotDocumentationHealth(document.id, true)");
		expect(pageSource).toContain('document.repairAvailability === "network_required"');
		expect(pageSource).toContain('document.repairAvailability === "source_required"');
		expect(pageSource).toContain("repairGodotDocumentation(document.id, allowNetwork)");
	});
});
