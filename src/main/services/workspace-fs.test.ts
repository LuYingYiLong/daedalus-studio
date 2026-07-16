import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPickedWorkspaceDirectory, listWorkspaceChildren, openWorkspaceDirectory } from "./workspace-fs";

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

	it("opens a workspace directory with the provided opener", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		const openedPaths: string[] = [];

		await expect(openWorkspaceDirectory(root, async (targetPath: string): Promise<string> => {
			openedPaths.push(targetPath);
			return "";
		})).resolves.toEqual({ opened: true });
		expect(openedPaths).toEqual([root]);
	});

	it("rejects opening a workspace path that is not a directory", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		const filePath: string = join(root, "project.godot");
		await writeFile(filePath, "config_version=5", "utf8");

		await expect(openWorkspaceDirectory(filePath, async (): Promise<string> => "")).rejects.toThrow("not a directory");
	});

	it("surfaces workspace directory opener errors", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));

		await expect(openWorkspaceDirectory(root, async (): Promise<string> => {
			return "explorer failed";
		})).rejects.toThrow("explorer failed");
	});
});
