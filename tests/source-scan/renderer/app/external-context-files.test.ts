import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("external dropped context files", () => {
	const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
	const imageAttachmentApiSource: string = readRepoFile("src", "renderer", "src", "api", "image-attachment-api.ts");

	it("keeps workspace paths scoped and adds outside files as absolute-path context", () => {
		expect(appSource).toContain("function createExternalFileContextItem");
		expect(appSource).toContain("external: true");
		expect(appSource).toContain("absolutePath");
		expect(appSource).toContain("function isLocalPathInsideWorkspace");
		expect(appSource).toContain("const workspaceLocalFiles");
		expect(appSource).toContain("const externalLocalFiles");
		expect(appSource).toContain("createExternalFileContextItem(fileEntry.file, fileEntry.path)");
		expect(appSource).toContain("paths: workspaceLocalFiles.map");
	});

	it("preserves dragged image source paths with session image attachments", () => {
		expect(appSource).toContain("sourcePath: sourcePath ?? undefined");
		expect(imageAttachmentApiSource).toContain("sourcePath?: string");
	});
});
