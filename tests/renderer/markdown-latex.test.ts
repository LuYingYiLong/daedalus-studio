import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { describe, expect, it } from "vitest";

function renderMarkdown(source: string): string {
	return renderToStaticMarkup(React.createElement(
		Markdown,
		{
			remarkPlugins: [remarkMath],
			rehypePlugins: [rehypeKatex],
		},
		source,
	));
}

describe("Markdown LaTeX rendering", () => {
	it("renders inline and display formulas with accessible MathML", () => {
		const html: string = renderMarkdown([
			"Inline $E = mc^2$.",
			"",
			"$$",
			"\\int_0^1 x^2\\,dx = \\frac{1}{3}",
			"$$",
		].join("\n"));

		expect(html).toContain('class="katex"');
		expect(html).toContain('class="katex-display"');
		expect(html).toContain("<math");
		expect(html).toContain('encoding="application/x-tex"');
		expect(html).not.toContain("[object Object]");
	});

	it("keeps invalid LaTeX visible instead of throwing", () => {
		expect((): string => renderMarkdown("$\\definitelyUnknownCommand{x}$")).not.toThrow();
		expect(renderMarkdown("$\\definitelyUnknownCommand{x}$")).toContain('mathcolor="#cc0000"');
	});
});
