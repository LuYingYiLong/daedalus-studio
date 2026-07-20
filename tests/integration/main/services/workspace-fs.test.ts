import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createWorkspaceEntriesFromAbsolutePaths, createWorkspaceEntryFromAbsolutePath, getPickedWorkspaceDirectory, listWorkspaceChildren, listWorkspaceLaunchTargets, openWorkspaceDirectory, openWorkspaceLaunchTarget } from "@main/services/workspace-fs";

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

	it("creates file and folder entries from selected workspace paths", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		await mkdir(join(root, "scripts"));
		await writeFile(join(root, "scripts", "player.gd"), "extends Node", "utf8");

		await expect(createWorkspaceEntryFromAbsolutePath(root, join(root, "scripts", "player.gd"), "file")).resolves.toEqual({
			name: "player.gd",
			relativePath: "scripts/player.gd",
			resourcePath: "res://scripts/player.gd",
			kind: "file"
		});
		await expect(createWorkspaceEntryFromAbsolutePath(root, join(root, "scripts"), "folder")).resolves.toEqual({
			name: "scripts",
			relativePath: "scripts",
			resourcePath: "res://scripts",
			kind: "folder"
		});
	});

	it("rejects selected paths outside workspace or with the wrong kind", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		const outsideRoot: string = mkdtempSync(join(tmpdir(), "daedalus-studio-outside-"));
		const filePath: string = join(root, "project.godot");
		await writeFile(filePath, "config_version=5", "utf8");

		await expect(createWorkspaceEntryFromAbsolutePath(root, join(outsideRoot, "project.godot"), "file")).rejects.toThrow("outside workspace");
		await expect(createWorkspaceEntryFromAbsolutePath(root, filePath, "folder")).rejects.toThrow("not a folder");
	});

	it("creates workspace entries from dropped absolute paths", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		await mkdir(join(root, "scripts"));
		const filePath: string = join(root, "scripts", "player.gd");
		await writeFile(filePath, "extends Node", "utf8");

		await expect(createWorkspaceEntriesFromAbsolutePaths({
			workspaceRoot: root,
			paths: [filePath, filePath]
		})).resolves.toEqual([{
			name: "player.gd",
			relativePath: "scripts/player.gd",
			resourcePath: "res://scripts/player.gd",
			kind: "file"
		}]);
	});

	it("rejects dropped paths outside workspace root", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		const outsideRoot: string = mkdtempSync(join(tmpdir(), "daedalus-studio-outside-"));
		const filePath: string = join(outsideRoot, "other.gd");
		await writeFile(filePath, "extends Node", "utf8");

		await expect(createWorkspaceEntriesFromAbsolutePaths({
			workspaceRoot: root,
			paths: [filePath]
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

	it("lists default and detected workspace launch targets", async () => {
		const localAppData: string = "C:/Users/test/AppData/Local";
		const programFiles: string = "C:/Program Files";
		const existingPaths: Set<string> = new Set([
			join(localAppData, "Programs", "Microsoft VS Code", "Code.exe"),
			join(programFiles, "Git", "git-bash.exe")
		]);

		const targets = await listWorkspaceLaunchTargets({
			platform: "win32",
			env: {
				LOCALAPPDATA: localAppData,
				ProgramFiles: programFiles
			},
			pathExists: async (targetPath: string): Promise<boolean> => existingPaths.has(targetPath),
			findOnPath: async (): Promise<string | null> => null
		});

		expect(targets.map((target) => target.id)).toEqual([
			"file-explorer",
			"terminal",
			"vscode",
			"git-bash"
		]);
	});

	it("opens Git Bash in the workspace root", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		const programFiles: string = "C:/Program Files";
		const gitBashPath: string = join(programFiles, "Git", "git-bash.exe");
		const spawned: Array<{ command: string; args: string[]; cwd: string }> = [];

		await expect(openWorkspaceLaunchTarget(root, "git-bash", {
			platform: "win32",
			env: { ProgramFiles: programFiles },
			pathExists: async (targetPath: string): Promise<boolean> => targetPath === gitBashPath,
			findOnPath: async (): Promise<string | null> => null,
			spawnProcess(command, args, options): { unref(): void } {
				spawned.push({ command, args, cwd: options.cwd });
				return { unref(): void {} };
			}
		})).resolves.toEqual({ opened: true, targetId: "git-bash" });

		expect(spawned).toEqual([{
			command: gitBashPath,
			args: [`--cd=${resolve(root)}`],
			cwd: resolve(root)
		}]);
	});

	it("opens PowerShell instead of the Windows Terminal app execution alias", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		const wtAliasPath: string = "C:/Users/test/AppData/Local/Microsoft/WindowsApps/wt.exe";
		const pwshPath: string = "C:/Program Files/PowerShell/7/pwsh.exe";
		const findCalls: string[] = [];
		const spawned: Array<{ command: string; args: string[]; cwd: string }> = [];

		await expect(openWorkspaceLaunchTarget(root, "terminal", {
			platform: "win32",
			findOnPath: async (command: string): Promise<string | null> => {
				findCalls.push(command);
				if (command === "wt.exe") {
					return wtAliasPath;
				}
				if (command === "pwsh.exe") {
					return pwshPath;
				}
				return null;
			},
			spawnProcess(command, args, options): { unref(): void } {
				spawned.push({ command, args, cwd: options.cwd });
				return { unref(): void {} };
			}
		})).resolves.toEqual({ opened: true, targetId: "terminal" });

		expect(findCalls).toEqual(["pwsh.exe"]);
		expect(spawned).toEqual([{
			command: pwshPath,
			args: ["-NoExit"],
			cwd: resolve(root)
		}]);
	});

	it("opens Windows PowerShell when pwsh is unavailable", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		const powershellPath: string = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
		const findCalls: string[] = [];
		const spawned: Array<{ command: string; args: string[]; cwd: string }> = [];

		await expect(openWorkspaceLaunchTarget(root, "terminal", {
			platform: "win32",
			findOnPath: async (command: string): Promise<string | null> => {
				findCalls.push(command);
				return command === "powershell.exe" ? powershellPath : null;
			},
			spawnProcess(command, args, options): { unref(): void } {
				spawned.push({ command, args, cwd: options.cwd });
				return { unref(): void {} };
			}
		})).resolves.toEqual({ opened: true, targetId: "terminal" });

		expect(findCalls).toEqual(["pwsh.exe", "powershell.exe"]);
		expect(spawned).toEqual([{
			command: powershellPath,
			args: ["-NoExit"],
			cwd: resolve(root)
		}]);
	});

	it("opens fallback terminal with workspace as cwd instead of an extra command argument", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		const spawned: Array<{ command: string; args: string[]; cwd: string }> = [];

		await expect(openWorkspaceLaunchTarget(root, "terminal", {
			platform: "win32",
			findOnPath: async (): Promise<string | null> => null,
			spawnProcess(command, args, options): { unref(): void } {
				spawned.push({ command, args, cwd: options.cwd });
				return { unref(): void {} };
			}
		})).resolves.toEqual({ opened: true, targetId: "terminal" });

		expect(spawned).toEqual([{
			command: "cmd.exe",
			args: ["/K"],
			cwd: resolve(root)
		}]);
	});
});
