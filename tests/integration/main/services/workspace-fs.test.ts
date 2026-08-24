import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createWorkspaceEntriesFromAbsolutePaths, createWorkspaceEntryFromAbsolutePath, createWorkspaceMediaFileUrl, getPickedWorkspaceDirectory, listWorkspaceChildren, listWorkspaceLaunchTargets, openWorkspaceDirectory, openWorkspaceFile, openWorkspaceLaunchTarget, readWorkspaceTextFile, revealWorkspaceFile, searchWorkspaceEntries, statWorkspaceFile, writeWorkspaceTextFile } from "@main/services/workspace-fs";

describe("workspace-fs", () => {
	it("reads UTF-8 text with a stable fingerprint and rejects binary or oversized editor input", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		await writeFile(join(root, "note.txt"), "你好 Daedalus", "utf8");
		await writeFile(join(root, "binary.dat"), Buffer.from([65, 0, 66]));
		await writeFile(join(root, "large.txt"), Buffer.alloc(2 * 1024 * 1024 + 1, 65));

		const text = await readWorkspaceTextFile({ workspaceRoot: root, filePath: "note.txt" });
		expect(text).toMatchObject({ readable: true, binary: false, oversized: false, content: "你好 Daedalus", relativePath: "note.txt" });
		expect(text.sha256).toHaveLength(64);
		const statResult = await statWorkspaceFile({ workspaceRoot: root, filePath: "note.txt" });
		expect(statResult.sha256).toBe(text.sha256);
		expect("content" in statResult).toBe(false);
		await expect(readWorkspaceTextFile({ workspaceRoot: root, filePath: "binary.dat" })).resolves.toMatchObject({ readable: false, binary: true });
		await expect(readWorkspaceTextFile({ workspaceRoot: root, filePath: "large.txt" })).resolves.toMatchObject({ readable: false, oversized: true });
	});

	it("creates scoped media URLs for supported files without exposing their filesystem paths", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		await writeFile(join(root, "preview.mp4"), Buffer.from([0, 1, 2, 3]));
		await writeFile(join(root, "notes.bin"), Buffer.from([0, 1, 2, 3]));

		const media = await createWorkspaceMediaFileUrl({ workspaceRoot: root, filePath: "preview.mp4" });
		expect(media).toMatchObject({ supported: true, kind: "video", mimeType: "video/mp4", relativePath: "preview.mp4", byteSize: 4 });
		expect(media.url).toMatch(/^daedalus-media:\/\/file\/[^/]+\/preview\.mp4$/u);
		expect(media.url).not.toContain(root);
		await expect(createWorkspaceMediaFileUrl({ workspaceRoot: root, filePath: "notes.bin" })).resolves.toMatchObject({ supported: false });
		await expect(createWorkspaceMediaFileUrl({ workspaceRoot: root, filePath: "../preview.mp4" })).rejects.toThrow();
	});

	it("writes text atomically and refuses stale file revisions", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		await writeFile(join(root, "note.txt"), "before", "utf8");
		const revision = await readWorkspaceTextFile({ workspaceRoot: root, filePath: "note.txt" });
		const saved = await writeWorkspaceTextFile({
			workspaceRoot: root,
			filePath: "note.txt",
			content: "after",
			expectedSha256: revision.sha256,
			expectedModifiedAtMs: revision.modifiedAtMs
		});

		expect(saved.saved).toBe(true);
		await expect(readWorkspaceTextFile({ workspaceRoot: root, filePath: "note.txt" })).resolves.toMatchObject({ content: "after", sha256: saved.sha256 });
		await expect(writeWorkspaceTextFile({
			workspaceRoot: root,
			filePath: "note.txt",
			content: "stale",
			expectedSha256: revision.sha256,
			expectedModifiedAtMs: revision.modifiedAtMs
		})).rejects.toThrow("workspace_file_conflict");
	});

	it("searches names and relative paths while respecting result limits", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		await mkdir(join(root, "scripts"));
		await writeFile(join(root, "scripts", "player.gd"), "extends Node", "utf8");
		await writeFile(join(root, "scripts", "player_test.gd"), "extends Node", "utf8");

		await expect(searchWorkspaceEntries({ workspaceRoot: root, query: "scripts/player", maxResults: 1 })).resolves.toMatchObject({
			entries: [{ relativePath: "scripts/player.gd", kind: "file" }],
			truncated: true
		});
	});
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
		const godotPath: string = "C:/Program Files/Godot/Godot.exe";
		const existingPaths: Set<string> = new Set([
			join(localAppData, "Programs", "Microsoft VS Code", "Code.exe"),
			join(programFiles, "Git", "git-bash.exe"),
			godotPath
		]);

		const targets = await listWorkspaceLaunchTargets({
			platform: "win32",
			env: {
				LOCALAPPDATA: localAppData,
				ProgramFiles: programFiles
			},
			godotExecutablePath: godotPath,
			pathExists: async (targetPath: string): Promise<boolean> => existingPaths.has(targetPath),
			findOnPath: async (): Promise<string | null> => null
		});

		expect(targets.map((target) => target.id)).toEqual([
			"file-explorer",
			"terminal",
			"vscode",
			"git-bash",
			"godot"
		]);
	});

	it("detects Visual Studio through vswhere before fixed installation paths", async () => {
		const programFilesX86: string = "C:/Program Files (x86)";
		const vswherePath: string = join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe");
		const installPath: string = "D:/Apps/Visual Studio/2022/Preview";
		const devenvPath: string = join(installPath, "Common7", "IDE", "devenv.exe");
		const existingPaths: Set<string> = new Set([vswherePath, devenvPath]);

		const targets = await listWorkspaceLaunchTargets({
			platform: "win32",
			env: { "ProgramFiles(x86)": programFilesX86 },
			pathExists: async (targetPath: string): Promise<boolean> => existingPaths.has(targetPath),
			findOnPath: async (): Promise<string | null> => null,
			runCommand: async (command: string, args: string[]): Promise<string | null> => {
				expect(command).toBe(vswherePath);
				expect(args).toContain("Microsoft.VisualStudio.Component.CoreEditor");
				return `${installPath}\r\n`;
			}
		});

		expect(targets.map((target) => target.id)).toContain("visual-studio");
	});

	it("opens files and directories inside the workspace while keeping reveal file-only", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		const filePath: string = join(root, "README.md");
		const directoryPath: string = join(root, "docs");
		const outsideRoot: string = mkdtempSync(join(tmpdir(), "daedalus-studio-outside-"));
		await writeFile(filePath, "# Daedalus", "utf8");
		await mkdir(directoryPath);
		const openedPaths: string[] = [];
		const revealedPaths: string[] = [];

		await expect(openWorkspaceFile({ workspaceRoot: root, filePath }, async (path: string): Promise<string> => {
			openedPaths.push(path);
			return "";
		})).resolves.toEqual({ opened: true });
		await expect(openWorkspaceFile({ workspaceRoot: root, filePath: directoryPath }, async (path: string): Promise<string> => {
			openedPaths.push(path);
			return "";
		})).resolves.toEqual({ opened: true });
		await expect(revealWorkspaceFile({ workspaceRoot: root, filePath }, (path: string): void => {
			revealedPaths.push(path);
		})).resolves.toEqual({ revealed: true });
		const canonicalFilePath: string = await realpath(filePath);
		const canonicalDirectoryPath: string = await realpath(directoryPath);
		expect(openedPaths).toEqual([canonicalFilePath, canonicalDirectoryPath]);
		expect(revealedPaths).toEqual([canonicalFilePath]);
		await expect(openWorkspaceFile({ workspaceRoot: root, filePath: join(outsideRoot, "README.md") }, async (): Promise<string> => "")).rejects.toThrow("outside workspace");
	});

	it("opens Godot editor with the workspace root as project path", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		const godotPath: string = "C:/Program Files/Godot/Godot.exe";
		const spawned: Array<{ command: string; args: string[]; cwd: string }> = [];

		await expect(openWorkspaceLaunchTarget(root, "godot", {
			godotExecutablePath: godotPath,
			pathExists: async (targetPath: string): Promise<boolean> => targetPath === godotPath,
			spawnProcess(command, args, options): { unref(): void } {
				spawned.push({ command, args, cwd: options.cwd });
				return { unref(): void {} };
			}
		})).resolves.toEqual({ opened: true, targetId: "godot" });

		expect(spawned).toEqual([{
			command: godotPath,
			args: ["--editor", "--path", resolve(root)],
			cwd: resolve(root)
		}]);
	});

	it("runs a Godot project without opening the editor", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		const godotPath: string = "C:/Program Files/Godot/Godot.exe";
		const spawned: Array<{ command: string; args: string[]; cwd: string }> = [];

		await expect(openWorkspaceLaunchTarget(root, "godot", {
			godotExecutablePath: godotPath,
			godotRunMode: "project",
			pathExists: async (targetPath: string): Promise<boolean> => targetPath === godotPath,
			spawnProcess(command, args, options): { unref(): void } {
				spawned.push({ command, args, cwd: options.cwd });
				return { unref(): void {} };
			}
		})).resolves.toEqual({ opened: true, targetId: "godot" });

		expect(spawned).toEqual([{
			command: godotPath,
			args: ["--path", resolve(root)],
			cwd: resolve(root)
		}]);
	});

	it("runs a Godot project through its configured main scene", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		await mkdir(join(root, "scenes"));
		await writeFile(join(root, "project.godot"), "config_version=5\n\n[application]\nconfig/name=\"Game\"\nrun/main_scene=\"res://scenes/Main.tscn\"\n", "utf8");
		const godotPath: string = "C:/Program Files/Godot/Godot.exe";
		const spawned: Array<{ command: string; args: string[]; cwd: string }> = [];

		await expect(openWorkspaceLaunchTarget(root, "godot", {
			godotExecutablePath: godotPath,
			godotRunMode: "project",
			pathExists: async (targetPath: string): Promise<boolean> => targetPath === godotPath,
			spawnProcess(command, args, options): { unref(): void } {
				spawned.push({ command, args, cwd: options.cwd });
				return { unref(): void {} };
			}
		})).resolves.toEqual({ opened: true, targetId: "godot" });

		expect(spawned).toEqual([{
			command: godotPath,
			args: ["--path", resolve(root), "scenes/Main.tscn"],
			cwd: resolve(root)
		}]);
	});

	it("runs a specific Godot scene with a project-relative scene path", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-studio-workspace-"));
		const godotPath: string = "C:/Program Files/Godot/Godot.exe";
		const spawned: Array<{ command: string; args: string[]; cwd: string }> = [];

		await expect(openWorkspaceLaunchTarget(root, "godot", {
			godotExecutablePath: godotPath,
			godotRunMode: "scene",
			godotScenePath: "scenes/Main.tscn",
			pathExists: async (targetPath: string): Promise<boolean> => targetPath === godotPath,
			spawnProcess(command, args, options): { unref(): void } {
				spawned.push({ command, args, cwd: options.cwd });
				return { unref(): void {} };
			}
		})).resolves.toEqual({ opened: true, targetId: "godot" });

		expect(spawned).toEqual([{
			command: godotPath,
			args: ["--path", resolve(root), "scenes/Main.tscn"],
			cwd: resolve(root)
		}]);
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
