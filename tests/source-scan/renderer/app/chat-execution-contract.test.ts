import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("chat execution contract source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");

	it("derives the workspace target from structured session state", () => {
		expect(source).toContain("function getCurrentWorkspaceId(");
		expect(source).toContain("workbench?.activeSelection.workspaceId");
		expect(source).toContain("mode === \"agent\" || mode === \"goal\"");
	});

	it("sends the execution contract for direct, queued, and retried requests", () => {
		expect(source.match(/executionPolicy: \"auto\"/g)).toHaveLength(4);
		expect(source.match(/outputTarget: getChatOutputTarget/g)).toHaveLength(4);
	});
});
