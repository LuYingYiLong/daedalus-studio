import { spawn, type ChildProcess } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { app, ipcMain } from "electron";

const SKILLS_CLI_TIMEOUT_MS: number = 10_000;
const SKILLS_CLI_INSTALL_TIMEOUT_MS: number = 60_000;
const SKILLS_CLI_MAX_OUTPUT_BYTES: number = 1_000_000;
const SKILL_SLUG_PATTERN: RegExp = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SKILLS_CLI_ARGUMENTS: readonly string[] = ["skills", "list", "--global", "--agent", "codex", "--json"];

export type NpxCodexSkill = {
	name: string;
	path: string;
	slug: string;
};

type SkillsCliCommandResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
};

type SkillsCliDependencies = {
	runCommand: (command: string, args: readonly string[], cwd: string, timeoutMs?: number) => Promise<SkillsCliCommandResult>;
	realpath: (path: string) => Promise<string>;
	lstat: (path: string) => Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean }>;
};

type SkillsCliListEntry = {
	name: string;
	path: string;
	scope: string;
	agents: string[];
};

type SkillsCliInvocation = {
	command: string;
	args: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInsideRoot(rootPath: string, candidatePath: string): boolean {
	const segment: string = relative(rootPath, candidatePath);
	return segment.length === 0 || (!segment.startsWith("..") && !isAbsolute(segment));
}

function getNpxCommand(platform: NodeJS.Platform = process.platform): string {
	return platform === "win32" ? "npx.cmd" : "npx";
}

function getPathEnvironment(environment: NodeJS.ProcessEnv): string {
	const pathKey: string | undefined = Object.keys(environment).find((key: string): boolean => key.toLowerCase() === "path");
	return pathKey === undefined ? "" : environment[pathKey] ?? "";
}

export async function resolveSkillsCliInvocation(
	command: string,
	args: readonly string[],
	options: { platform?: NodeJS.Platform; pathEnvironment?: string } = {}
): Promise<SkillsCliInvocation> {
	const platform: NodeJS.Platform = options.platform ?? process.platform;
	if (platform !== "win32" || command.toLowerCase() !== "npx.cmd") {
		return { command, args };
	}

	const pathEnvironment: string = options.pathEnvironment ?? getPathEnvironment(process.env);
	const candidatePaths: string[] = pathEnvironment
		.split(delimiter)
		.map((segment: string): string => segment.trim())
		.filter((segment: string): boolean => segment.length > 0)
		.map((segment: string): string => join(segment, "npx.cmd"));
	for (const candidatePath of candidatePaths) {
		try {
			const npxStats = await lstat(candidatePath);
			if (!npxStats.isFile()) {
				continue;
			}
			const nodePath: string = join(dirname(candidatePath), "node.exe");
			const npxCliPath: string = join(dirname(candidatePath), "node_modules", "npm", "bin", "npx-cli.js");
			const [nodeStats, npxCliStats] = await Promise.all([lstat(nodePath), lstat(npxCliPath)]);
			if (nodeStats.isFile() && npxCliStats.isFile()) {
				return { command: nodePath, args: [npxCliPath, ...args] };
			}
		} catch {
			// Try the next PATH entry. npm's Windows shim lives beside node.exe.
		}
	}

	throw new Error("Unable to locate the Node runtime required to run the locally installed Skills CLI.");
}

function clipOutput(value: string): string {
	return value.length > 1200 ? `${value.slice(0, 1200)}...` : value;
}

function requiresNpxInstall(result: SkillsCliCommandResult): boolean {
	if (result.exitCode === 0 || result.timedOut) {
		return false;
	}
	const output: string = `${result.stderr}\n${result.stdout}`;
	return /npx\s+canceled due to missing packages and no YES option/iu.test(output);
}

function parseSkillsCliList(value: string): SkillsCliListEntry[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value) as unknown;
	} catch {
		throw new Error("Skills CLI returned invalid JSON.");
	}
	if (!Array.isArray(parsed)) {
		throw new Error("Skills CLI returned an invalid skill list.");
	}
	return parsed.map((entry: unknown): SkillsCliListEntry => {
		if (!isRecord(entry)
			|| typeof entry.name !== "string"
			|| typeof entry.path !== "string"
			|| typeof entry.scope !== "string"
			|| !Array.isArray(entry.agents)
			|| !entry.agents.every((agent: unknown): agent is string => typeof agent === "string")) {
			throw new Error("Skills CLI returned an invalid skill entry.");
		}
		return {
			name: entry.name,
			path: entry.path,
			scope: entry.scope,
			agents: entry.agents
		};
	});
}

async function runSkillsCliCommand(
	command: string,
	args: readonly string[],
	cwd: string,
	timeoutMs: number = SKILLS_CLI_TIMEOUT_MS
): Promise<SkillsCliCommandResult> {
	const invocation: SkillsCliInvocation = await resolveSkillsCliInvocation(command, args);
	return await new Promise<SkillsCliCommandResult>((resolveResult): void => {
		const child: ChildProcess = spawn(invocation.command, [...invocation.args], {
			cwd,
			env: process.env,
			windowsHide: true,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"]
		});
		let stdout: string = "";
		let stderr: string = "";
		let timedOut: boolean = false;
		let outputExceeded: boolean = false;
		let settled: boolean = false;
		const timeout = setTimeout((): void => {
			timedOut = true;
			child.kill();
		}, timeoutMs);
		const finish = (result: SkillsCliCommandResult): void => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			resolveResult(result);
		};
		const appendOutput = (current: string, chunk: string): string => {
			const next: string = current + chunk;
			if (Buffer.byteLength(next, "utf8") > SKILLS_CLI_MAX_OUTPUT_BYTES) {
				outputExceeded = true;
				child.kill();
			}
			return next.slice(0, SKILLS_CLI_MAX_OUTPUT_BYTES);
		};

		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string): void => {
			stdout = appendOutput(stdout, chunk);
		});
		child.stderr?.on("data", (chunk: string): void => {
			stderr = appendOutput(stderr, chunk);
		});
		child.on("error", (error: Error): void => {
			finish({ exitCode: 1, stdout, stderr: appendOutput(stderr, error.message), timedOut });
		});
		child.on("close", (code: number | null): void => {
			finish({
				exitCode: outputExceeded ? 1 : code ?? 1,
				stdout,
				stderr: outputExceeded ? `${stderr}\nSkills CLI output exceeded the allowed limit.` : stderr,
				timedOut
			});
		});
	});
}

const defaultDependencies: SkillsCliDependencies = {
	runCommand: runSkillsCliCommand,
	realpath,
	lstat
};

export async function listGlobalCodexSkills(
	options: {
		codexSkillsDirectory?: string;
		homeDirectory?: string;
		dependencies?: SkillsCliDependencies;
		platform?: NodeJS.Platform;
	} = {}
): Promise<NpxCodexSkill[]> {
	const dependencies: SkillsCliDependencies = options.dependencies ?? defaultDependencies;
	const homeDirectory: string = resolve(options.homeDirectory ?? app.getPath("home"));
	const codexSkillsDirectory: string = resolve(options.codexSkillsDirectory ?? join(homeDirectory, ".codex", "skills"));
	const npxCommand: string = getNpxCommand(options.platform);
	let result: SkillsCliCommandResult = await dependencies.runCommand(
		npxCommand,
		["--no-install", ...SKILLS_CLI_ARGUMENTS],
		homeDirectory,
		SKILLS_CLI_TIMEOUT_MS
	);
	if (requiresNpxInstall(result)) {
		result = await dependencies.runCommand(
			npxCommand,
			["--yes", ...SKILLS_CLI_ARGUMENTS],
			homeDirectory,
			SKILLS_CLI_INSTALL_TIMEOUT_MS
		);
	}
	if (result.timedOut) {
		throw new Error("Skills CLI timed out while listing global Codex skills.");
	}
	if (result.exitCode !== 0) {
		const detail: string = clipOutput(result.stderr.trim() || result.stdout.trim());
		throw new Error(detail.length > 0
			? `Unable to run the locally installed Skills CLI: ${detail}`
			: "Unable to run the locally installed Skills CLI. Install it locally, then retry.");
	}

	const entries: SkillsCliListEntry[] = parseSkillsCliList(result.stdout);
	if (entries.length === 0) {
		return [];
	}
	let rootRealPath: string;
	try {
		rootRealPath = await dependencies.realpath(codexSkillsDirectory);
	} catch {
		return [];
	}
	const seenPaths = new Set<string>();
	const skills: NpxCodexSkill[] = [];
	for (const entry of entries) {
		if (entry.scope !== "global" || !entry.agents.some((agent: string): boolean => agent.toLowerCase() === "codex")) {
			continue;
		}
		if (entry.name.trim().length === 0 || entry.name.length > 200 || !isAbsolute(entry.path)) {
			continue;
		}
		let sourceRealPath: string;
		try {
			sourceRealPath = await dependencies.realpath(entry.path);
			const sourceStats = await dependencies.lstat(entry.path);
			if (sourceStats.isSymbolicLink() || !sourceStats.isDirectory() || !isInsideRoot(rootRealPath, sourceRealPath)) {
				continue;
			}
		} catch {
			continue;
		}
		const sourceSegments: string[] = relative(rootRealPath, sourceRealPath)
			.split(/[\\/]/u)
			.filter((segment: string): boolean => segment.length > 0);
		const slug: string = sourceSegments[0] ?? "";
		if (sourceSegments.length !== 1 || !SKILL_SLUG_PATTERN.test(slug) || seenPaths.has(sourceRealPath)) {
			continue;
		}
		seenPaths.add(sourceRealPath);
		skills.push({ name: entry.name.trim(), path: sourceRealPath, slug });
	}
	return skills.sort((left: NpxCodexSkill, right: NpxCodexSkill): number => left.name.localeCompare(right.name));
}

export function registerSkillsCliIpc(): void {
	ipcMain.handle("skills-cli:list-global-codex", async (): Promise<NpxCodexSkill[]> => await listGlobalCodexSkills());
}
