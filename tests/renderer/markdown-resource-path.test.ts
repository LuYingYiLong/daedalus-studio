import { describe, expect, it } from "vitest";
import { formatMarkdownResourceLabel, parseMarkdownResourceHref } from "@/domain/markdown/markdown-resource-path";

describe("markdown resource paths", () => {
	it("recognizes Windows paths and normalizes escaped separators", () => {
		expect(parseMarkdownResourceHref("C:\\\\Users\\\\LuYingYiLong\\\\project\\\\index.html")).toMatchObject({
			absolutePath: "C:\\Users\\LuYingYiLong\\project\\index.html",
			fileName: "index.html"
		});
	});

	it("recognizes file URLs", () => {
		expect(parseMarkdownResourceHref("file:///C:/workspace/src/app.ts")).toMatchObject({
			absolutePath: "C:\\workspace\\src\\app.ts"
		});
	});

	it("separates a line and column suffix from the file path", () => {
		const resource = parseMarkdownResourceHref("C:/workspace/src/App.tsx:2942:7");

		expect(resource).toMatchObject({
			absolutePath: "C:\\workspace\\src\\App.tsx",
			fileName: "App.tsx",
			line: 2942,
			column: 7
		});
		expect(formatMarkdownResourceLabel(resource!, "App.tsx")).toBe("App.tsx (line 2942, column 7)");
		expect(formatMarkdownResourceLabel(resource!, "App.tsx:2942:7")).toBe("App.tsx (line 2942, column 7)");
		expect(formatMarkdownResourceLabel(resource!, "中文语言资源")).toBe("中文语言资源");
	});

	it("leaves web, anchor and relative links unchanged", () => {
		expect(parseMarkdownResourceHref("https://example.com/file.ts")).toBeNull();
		expect(parseMarkdownResourceHref("#section")).toBeNull();
		expect(parseMarkdownResourceHref("src/app.ts")).toBeNull();
	});

	it("does not throw on malformed URL encoding", () => {
		expect(parseMarkdownResourceHref("C:\\workspace\\bad%2Ffile.ts")).not.toBeNull();
	});
});
