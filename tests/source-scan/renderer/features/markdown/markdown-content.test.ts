import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("MarkdownContent source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "widgets", "markdown", "MarkdownContent.tsx");
	const resourceLinkSource: string = readRepoFile("src", "renderer", "src", "widgets", "markdown", "MarkdownResourceLink.tsx");
	const resourceLinkStyles: string = readRepoFile("src", "renderer", "src", "widgets", "markdown", "MarkdownResourceLink.module.css");
	const fileIconSource: string = readRepoFile("src", "renderer", "src", "widgets", "markdown", "file-icon.tsx");
	const htmlIconSource: string = readRepoFile("src", "renderer", "src", "assets", "icons", "html.svg");
	const mermaidBlockSource: string = readRepoFile("src", "renderer", "src", "widgets", "markdown", "MermaidBlock.tsx");
	const mermaidRendererSource: string = readRepoFile("src", "renderer", "src", "widgets", "markdown", "mermaid-renderer.ts");
	const packageManifest = JSON.parse(readRepoFile("package.json")) as { dependencies?: Record<string, string> };

	it("guards highlight.js calls and uses a lightweight streaming renderer", () => {
		expect(source).toContain("gd: \"gdscript\"");
		expect(source).toContain("hljs.getLanguage(normalizedLanguage)");
		expect(source).not.toContain("hljs.highlightAuto(code).value");
		expect(source).toContain("getStreamingMarkdownRenderIntervalMs");
		expect(source).toContain("STREAMING_MARKDOWN_COMPONENTS");
		expect(source).toContain("highlight={highlightCodeBlocks}");
		expect(source).not.toContain("language.replace(/^hljs");
		expect(source).toContain("a: MarkdownLink");
		expect(source).toContain("urlTransform={transformMarkdownUrl}");
		expect(source).not.toContain("resolveMarkdownResourceHref");
	});

	it("renders completed Mermaid fences securely without parsing partial streams", () => {
		expect(packageManifest.dependencies?.mermaid).toBeDefined();
		expect(source).toContain('language.toLowerCase() === "mermaid"');
		expect(source).toContain("<MermaidBlock source={code} />");
		expect(source).toContain("createMarkdownComponents(false, false, false)");
		expect(source).toContain("createMarkdownComponents(false, true, false)");
		expect(mermaidRendererSource).toContain('await import("mermaid")');
		expect(mermaidRendererSource).toContain('securityLevel: "strict"');
		expect(mermaidRendererSource).toContain("suppressErrorRendering: true");
		expect(mermaidRendererSource).toContain("renderQueue");
		expect(mermaidBlockSource).toContain('attributeFilter: ["data-theme", "style"]');
		expect(mermaidBlockSource).toContain("scrollFrameCoordinator?.schedule()");
		expect(mermaidBlockSource).toContain("import { App, Button, Collapse, Tooltip } from \"antd\"");
		expect(mermaidBlockSource).toContain("className={styles.sourceCollapse}");
		expect(mermaidBlockSource).not.toContain("<details");
		expect(readRepoFile("src", "renderer", "src", "widgets", "markdown", "MermaidBlock.module.css")).toContain(".sourceCollapse :global(.ant-collapse-header)");
	});

	it("renders local resources as non-navigating links with visible file icons", () => {
		expect(resourceLinkSource).toContain('role="link"');
		expect(resourceLinkSource).toContain("tabIndex={0}");
		expect(resourceLinkSource).toContain('<FileIcon path={resource.fileName}');
		expect(resourceLinkSource).not.toContain('href="#workspace-resource"');
		expect(resourceLinkStyles).toContain("display: inline;");
		expect(resourceLinkStyles).not.toContain("display: inline-flex;");
		expect(resourceLinkStyles).toContain("vertical-align: baseline;");
		expect(resourceLinkStyles).toContain("vertical-align: -0.125em;");
		expect(resourceLinkStyles).toContain("width: 16px !important");
		expect(resourceLinkStyles).toContain("height: 16px !important");
		expect(fileIconSource).toContain("data-file-icon={iconName}");
		expect(htmlIconSource).toContain('fill="currentColor"');
	});
});
