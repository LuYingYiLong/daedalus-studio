import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Ant Design button icon alignment", () => {
	it("centers the custom SVG icon slot without changing standalone icons", () => {
		const globalStyles: string = readRepoFile("src", "renderer", "src", "ui", "styles", "global.css");

		expect(globalStyles).toContain(".ant-btn > .ant-btn-icon {");
		expect(globalStyles).toContain("align-items: center;");
		expect(globalStyles).toContain("line-height: 0;");
		expect(globalStyles).toContain(".ant-btn > .ant-btn-icon > .daedalus-icon {");
		expect(globalStyles).toContain("display: block;");
	});
});
