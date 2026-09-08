import { describe, expect, it } from "vitest";
import { resolveWorkspaceProjectName } from "@/widgets/workspace/workspace-project-name";

describe("workspace project name fallback", () => {
	it("uses the primary folder name for a blank new-project input", () => {
		expect(resolveWorkspaceProjectName("   ", "C:\\Projects\\My Game\\")).toBe("My Game");
		expect(resolveWorkspaceProjectName("", "/workspace/demo/")).toBe("demo");
	});

	it("keeps an explicit project name and rejects a filesystem root", () => {
		expect(resolveWorkspaceProjectName("  Custom name  ", "C:\\Projects\\My Game")).toBe("Custom name");
		expect(resolveWorkspaceProjectName("", "C:\\")).toBe("");
	});
});
