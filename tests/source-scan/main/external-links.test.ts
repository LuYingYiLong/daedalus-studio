import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("External link IPC", () => {
	it("allows provider websites while keeping protocol validation", () => {
		const source: string = readRepoFile("src", "main", "index.ts");

		expect(source).toContain('if (url.protocol !== "https:" && url.protocol !== "http:")');
		expect(source).toContain('throw new Error("window_external_url_not_allowed")');
		expect(source).toContain('throw new Error("window_external_url_invalid")');
		expect(source).not.toContain('url.hostname !== "github.com"');
	});
});
