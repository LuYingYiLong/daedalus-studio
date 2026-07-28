import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("app background layering", () => {
	it("keeps the renderer root on the base background layer", () => {
		const globalCss: string = readRepoFile("src", "renderer", "src", "styles", "global.css");

		expect(globalCss).toContain("#root");
		expect(globalCss).toContain("background: var(--ds-bg);");
	});
});
