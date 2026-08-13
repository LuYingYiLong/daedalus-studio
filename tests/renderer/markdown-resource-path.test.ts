import { describe, expect, it } from "vitest";
import { getFileExtensionForLanguage, getFileIconName, normalizeHighlightLanguage } from "@/domain/markdown/file-icon";
import { formatMarkdownResourceLabel, parseMarkdownResourceHref } from "@/domain/markdown/markdown-resource-path";
import { transformMarkdownUrl } from "@/domain/markdown/markdown-url-transform";

const LINK_NODE = { tagName: "a" } as Parameters<typeof transformMarkdownUrl>[2];
const IMAGE_NODE = { tagName: "img" } as Parameters<typeof transformMarkdownUrl>[2];

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

	it("selects the HTML icon from Windows resource file names", () => {
		expect(getFileIconName("C:\\Users\\LuYingYiLong\\Documents\\test\\lagrange-like\\index.html")).toBe("html");
		expect(getFileIconName("index.HTML")).toBe("html");
	});

	it("normalizes code language aliases for highlighting and file export", () => {
		expect(normalizeHighlightLanguage("gd")).toBe("gdscript");
		expect(normalizeHighlightLanguage("hljs-PS1")).toBe("powershell");
		expect(getFileExtensionForLanguage("gd")).toBe("gd");
		expect(getFileExtensionForLanguage("typescript")).toBe("ts");
		expect(getFileExtensionForLanguage("plain")).toBe("txt");
	});

	it("preserves validated local file links before react-markdown renders them", () => {
		const windowsPath: string = "C:/Users/LuYingYiLong/Documents/test/lagrange-like/index.html";
		expect(transformMarkdownUrl(windowsPath, "href", LINK_NODE)).toBe(windowsPath);
		expect(transformMarkdownUrl("file:///C:/workspace/src/App.tsx:42", "href", LINK_NODE)).toBe("file:///C:/workspace/src/App.tsx:42");
	});

	it("keeps default URL sanitization for non-resource URLs and image sources", () => {
		expect(transformMarkdownUrl("https://example.com", "href", LINK_NODE)).toBe("https://example.com");
		expect(transformMarkdownUrl("javascript:alert(1)", "href", LINK_NODE)).toBe("");
		expect(transformMarkdownUrl("C:/workspace/image.png", "src", IMAGE_NODE)).toBe("");
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
