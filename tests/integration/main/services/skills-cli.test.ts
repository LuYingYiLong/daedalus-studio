import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listGlobalCodexSkills, resolveSkillsCliInvocation } from "@main/services/skills-cli";

type CommandResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
};

function createDependencies(result: CommandResult, onRun?: (command: string, args: readonly string[], cwd: string) => void) {
	return {
		runCommand: async (command: string, args: readonly string[], cwd: string): Promise<CommandResult> => {
			onRun?.(command, args, cwd);
			return result;
		},
		realpath,
		lstat
	};
}

describe("skills-cli", () => {
	it("runs the Windows npx CLI through its adjacent Node runtime without a command shell", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-skills-cli-node-"));
		const npmBinDirectory: string = join(root, "node_modules", "npm", "bin");
		const nodePath: string = join(root, "node.exe");
		const npxCliPath: string = join(npmBinDirectory, "npx-cli.js");
		await mkdir(npmBinDirectory, { recursive: true });
		await Promise.all([
			writeFile(join(root, "npx.cmd"), "@echo off\r\n"),
			writeFile(nodePath, "node"),
			writeFile(npxCliPath, "cli")
		]);

		const invocation = await resolveSkillsCliInvocation(
			"npx.cmd",
			["--no-install", "skills", "list"],
			{ platform: "win32", pathEnvironment: root }
		);

		expect(invocation).toEqual({
			command: nodePath,
			args: [npxCliPath, "--no-install", "skills", "list"]
		});
	});

	it("runs the local Skills CLI with the Codex global JSON list arguments", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-skills-cli-"));
		const skillPath: string = join(root, "review-godot");
		await mkdir(skillPath);
		let receivedCommand: string | undefined;
		let receivedArgs: readonly string[] | undefined;
		const result = await listGlobalCodexSkills({
			codexSkillsDirectory: root,
			homeDirectory: root,
			platform: "win32",
			dependencies: createDependencies({
				exitCode: 0,
				stdout: JSON.stringify([{ name: "Review Godot", path: skillPath, scope: "global", agents: ["Codex"] }]),
				stderr: "",
				timedOut: false
			}, (command: string, args: readonly string[]): void => {
				receivedCommand = command;
				receivedArgs = args;
			})
		});

		expect(receivedCommand).toBe("npx.cmd");
		expect(receivedArgs).toEqual(["--no-install", "skills", "list", "--global", "--agent", "codex", "--json"]);
		expect(result).toEqual([{ name: "Review Godot", path: await realpath(skillPath), slug: "review-godot" }]);
	});

	it("allows npx to install the CLI only after a precise missing-package result", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-skills-cli-install-"));
		const skillPath: string = join(root, "review-godot");
		await mkdir(skillPath);
		const calls: Array<readonly string[]> = [];
		let attempt: number = 0;
		const result = await listGlobalCodexSkills({
			codexSkillsDirectory: root,
			homeDirectory: root,
			dependencies: {
				runCommand: async (_command: string, args: readonly string[], _cwd: string): Promise<CommandResult> => {
					calls.push(args);
					attempt += 1;
					return attempt === 1
						? {
							exitCode: 1,
							stdout: "",
							stderr: "npm error npx canceled due to missing packages and no YES option: [\\\"skills@1.5.22\\\"]",
							timedOut: false
						}
						: {
							exitCode: 0,
							stdout: JSON.stringify([{ name: "Review Godot", path: skillPath, scope: "global", agents: ["Codex"] }]),
							stderr: "",
							timedOut: false
						};
				},
				realpath,
				lstat
			}
		});

		expect(calls).toHaveLength(2);
		expect(calls[0]?.[0]).toBe("--no-install");
		expect(calls[1]?.[0]).toBe("--yes");
		expect(result).toEqual([{ name: "Review Godot", path: await realpath(skillPath), slug: "review-godot" }]);
	});

	it("filters invalid, outside-root, nested, and non-Codex entries", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-skills-cli-"));
		const validPath: string = join(root, "valid-skill");
		const nestedPath: string = join(root, "nested", "child-skill");
		const outsideRoot: string = mkdtempSync(join(tmpdir(), "daedalus-skills-cli-outside-"));
		const outsidePath: string = join(outsideRoot, "outside-skill");
		await Promise.all([mkdir(validPath), mkdir(nestedPath, { recursive: true }), mkdir(outsidePath)]);
		const result = await listGlobalCodexSkills({
			codexSkillsDirectory: root,
			homeDirectory: root,
			dependencies: createDependencies({
				exitCode: 0,
				stdout: JSON.stringify([
					{ name: "Valid", path: validPath, scope: "global", agents: ["Codex"] },
					{ name: "Nested", path: nestedPath, scope: "global", agents: ["Codex"] },
					{ name: "Outside", path: outsidePath, scope: "global", agents: ["Codex"] },
					{ name: "Other Agent", path: validPath, scope: "global", agents: ["Cursor"] },
					{ name: "Project", path: validPath, scope: "project", agents: ["Codex"] },
					{ name: "Bad path", path: "relative-skill", scope: "global", agents: ["Codex"] }
				]),
				stderr: "",
				timedOut: false
			})
		});

		expect(result).toEqual([{ name: "Valid", path: await realpath(validPath), slug: "valid-skill" }]);
	});

	it("reports unavailable, timed out, and malformed Skills CLI results", async () => {
		const root: string = mkdtempSync(join(tmpdir(), "daedalus-skills-cli-"));
		const unavailable = (): Promise<unknown> => listGlobalCodexSkills({
			codexSkillsDirectory: root,
			homeDirectory: root,
			dependencies: createDependencies({ exitCode: 1, stdout: "", stderr: "npx was not found", timedOut: false })
		});
		const timedOut = (): Promise<unknown> => listGlobalCodexSkills({
			codexSkillsDirectory: root,
			homeDirectory: root,
			dependencies: createDependencies({ exitCode: 1, stdout: "", stderr: "", timedOut: true })
		});
		const malformed = (): Promise<unknown> => listGlobalCodexSkills({
			codexSkillsDirectory: root,
			homeDirectory: root,
			dependencies: createDependencies({ exitCode: 0, stdout: "not-json", stderr: "", timedOut: false })
		});

		await expect(unavailable()).rejects.toThrow("Unable to run the locally installed Skills CLI");
		await expect(timedOut()).rejects.toThrow("timed out");
		await expect(malformed()).rejects.toThrow("invalid JSON");
	});
});
