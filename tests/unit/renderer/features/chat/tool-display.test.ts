import { describe, expect, it } from "vitest";
import { getToolDisplayInfo } from "@/features/chat/tool-display";

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
});
