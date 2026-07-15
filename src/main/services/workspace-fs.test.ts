import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPickedWorkspaceDirectory, listWorkspaceChildren } from "./workspace-fs";

describe("workspace-fs", () => {
	it("lists files and folders inside workspace root", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		await mkdir(join(root, "scripts"));
		await writeFile(join(root, "project.godot"), "config_version=5", "utf8");

		const result = await listWorkspaceChildren({
			workspaceRoot: root,
			relativePath: ""
		});

		expect(result.entries.map((entry) => `${entry.kind}:${entry.resourcePath}`)).toEqual([
			"folder:res://scripts",
			"file:res://project.godot"
		]);
	});

	it("rejects paths outside workspace root", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));

		await expect(listWorkspaceChildren({
			workspaceRoot: root,
			relativePath: "../"
		})).rejects.toThrow("outside workspace");
	});

	it("normalizes canceled workspace directory picks", () => {
		expect(getPickedWorkspaceDirectory({
			canceled: true,
			filePaths: []
		})).toBeNull();
	});

	it("normalizes selected workspace directory picks", () => {
		expect(getPickedWorkspaceDirectory({
			canceled: false,
			filePaths: ["D:/GodotProjects/example"]
		})).toBe("D:/GodotProjects/example");
	});
});
