import { describe, expect, it } from "vitest";
import { getToolDisplayInfo } from "@/domain/conversation/tool-display";
import {
	registerToolDisplayTemplates,
	unregisterToolDisplayTemplates,
} from "@/domain/conversation/tool-display-templates";

describe("tool display", () => {
	it("uses the actual tool-call arguments after a streaming preview", (): void => {
		const display = getToolDisplayInfo([
			{
				type: "tool.call",
				preview: true,
				toolName: "mcp_workspace_overwrite_text_file",
				args: {}
			},
			{
				type: "tool.call",
				toolName: "mcp_workspace_overwrite_text_file",
				args: { relativePath: "index.html" }
			}
		]);

		expect(display.label).toBe("Overwrite file: index.html");
	});

	it("accepts namespaced plugin templates without replacing built-ins", (): void => {
		registerToolDisplayTemplates("plugin:@scope/fixture@1.0.0:abcdef", {
			inspect: {
				label: "Inspect fixture",
				iconName: "inspect",
				target: "file",
			},
		});

		try {
			const display = getToolDisplayInfo([
				{
					toolName: "plugin:@scope/fixture@1.0.0:abcdef:inspect",
					args: { relativePath: "README.md" },
				},
			]);

			expect(display.label).toBe("Inspect fixture: README.md");
			expect(display.iconName).toBe("inspect");
		} finally {
			unregisterToolDisplayTemplates("plugin:@scope/fixture@1.0.0:abcdef");
		}
	});
});
