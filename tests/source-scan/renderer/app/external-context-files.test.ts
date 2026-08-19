import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../helpers/repo-paths";

describe("external dropped context files", () => {
	const appSource: string = readAppImplementation();
	const imageAttachmentApiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "image-attachment-api.ts");

	it("keeps workspace paths scoped and adds outside files as absolute-path context", () => {
		expect(appSource).toContain("export function createExternalFileContextItem");
		expect(appSource).toContain("external: true");
		expect(appSource).toContain("absolutePath");
		expect(appSource).toContain("export function isLocalPathInsideWorkspace");
		expect(appSource).toContain("const workspaceLocalFiles");
		expect(appSource).toContain("const externalLocalFiles");
		expect(appSource).toContain("createExternalFileContextItem(entry.file, entry.path)");
		expect(appSource).toContain("paths: workspaceLocalFiles.map");
	});

	it("preserves dragged image source paths with session image attachments", () => {
		expect(appSource).toContain("ensureActiveSessionId");
		expect(appSource).toContain("await params.ensureActiveSessionId()");
		expect(appSource).toContain("resolveSupportedImageMimeType(file)");
		expect(appSource).toContain('normalizedMimeType === "image/jpg"');
		expect(appSource).toContain("sourcePath: sourcePath ?? undefined");
		expect(imageAttachmentApiSource).toContain("sourcePath?: string");
	});
});
