import { describe, expect, it } from "vitest";
import { selectGodotRuntimeSource } from "@/features/godot-runtime-test/runtime-test-launcher";
import type { WorkspaceConfig, WorkspaceSourceFolder } from "@/platform/rpc/types";

function source(id: string, godot: boolean): WorkspaceSourceFolder {
	return {
		id,
		path: `C:/workspace/${id}`,
		capabilities: { git: false, godot },
	};
}

function workspace(sources: WorkspaceSourceFolder[], primarySourceFolderId: string): WorkspaceConfig {
	return {
		id: "workspace-runtime",
		name: "Runtime fixture",
		kind: "workspace",
		rootPath: "C:/workspace",
		icon: 0,
		color: 0,
		sourceFolders: sources,
		primarySourceFolderId,
	};
}

describe("selectGodotRuntimeSource", (): void => {
	it("uses the primary Godot source for an AI-triggered visible launch", (): void => {
		const selected = selectGodotRuntimeSource(workspace([
			source("other", false),
			source("game", true),
		], "game"));
		expect(selected.id).toBe("game");
	});

	it("uses the only Godot source when the workspace primary is not a Godot project", (): void => {
		const selected = selectGodotRuntimeSource(workspace([
			source("primary", false),
			source("game", true),
		], "primary"));
		expect(selected.id).toBe("game");
	});

	it("requires an explicit source when several non-primary Godot projects exist", (): void => {
		const fixture = workspace([source("game-a", true), source("game-b", true)], "missing");
		expect((): WorkspaceSourceFolder => selectGodotRuntimeSource(fixture)).toThrow("runtime_test_source_required");
		expect(selectGodotRuntimeSource(fixture, "game-b").id).toBe("game-b");
	});
});
