import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	TerminalPtyService,
	resolveDefaultTerminalShell,
	resolveTerminalCwd,
	shouldUseBundledConptyDll,
	type TerminalExitEvent,
	type TerminalPtyProcess,
	type TerminalSpawnOptions
} from "@main/services/terminal-pty";

type ExitHandler = (event: { exitCode: number; signal?: number | undefined }) => void;

class FakePty implements TerminalPtyProcess {
	public readonly writes: string[] = [];
	public readonly resizes: Array<{ cols: number; rows: number }> = [];
	public killCount: number = 0;
	private readonly exitHandlers: Set<ExitHandler> = new Set();

	public onData(): { dispose(): void } {
		return { dispose(): void {} };
	}

	public onExit(callback: ExitHandler): { dispose(): void } {
		this.exitHandlers.add(callback);
		return {
			dispose: (): void => {
				this.exitHandlers.delete(callback);
			}
		};
	}

	public write(data: string): void {
		this.writes.push(data);
	}

	public resize(cols: number, rows: number): void {
		this.resizes.push({ cols, rows });
	}

	public kill(): void {
		this.killCount += 1;
	}

	public emitExit(exitCode: number, signal?: number): void {
		for (const handler of [...this.exitHandlers]) {
			handler({ exitCode, signal });
		}
	}
}

function normalizePathForTest(targetPath: string): string {
	return targetPath.replaceAll("\\", "/");
}

describe("terminal pty service", () => {
	it("prefers pwsh.exe on Windows and falls back to powershell.exe", async () => {
		const calls: string[] = [];
		const fallbackShell: string = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

		await expect(resolveDefaultTerminalShell({
			platform: "win32",
			findOnPath: async (command: string): Promise<string | null> => {
				calls.push(command);
				return command === "powershell.exe" ? fallbackShell : null;
			}
		})).resolves.toBe(fallbackShell);

		expect(calls).toEqual(["pwsh.exe", "powershell.exe"]);
	});

	it("uses workspace cwd first and falls back to the Windows home path", async () => {
		const workspaceRoot: string = mkdtempSync(join(tmpdir(), "daedalus-studio-terminal-"));
		const homePath: string = resolve("C:/Users/tester");
		const existingDirectories: Set<string> = new Set([resolve(workspaceRoot), homePath]);

		await expect(resolveTerminalCwd(workspaceRoot, {
			env: {
				HOMEDRIVE: "C:",
				HOMEPATH: "/Users/tester"
			},
			pathIsDirectory: async (targetPath: string): Promise<boolean> => existingDirectories.has(targetPath)
		})).resolves.toBe(resolve(workspaceRoot));

		await expect(resolveTerminalCwd(null, {
			env: {
				HOMEDRIVE: "C:",
				HOMEPATH: "/Users/tester"
			},
			pathIsDirectory: async (targetPath: string): Promise<boolean> => existingDirectories.has(targetPath)
		})).resolves.toBe(homePath);
	});

	it("does not force bundled ConPTY when the loaded native module has no sibling DLL", async () => {
		await expect(shouldUseBundledConptyDll({
			platform: "win32",
			arch: "x64",
			nodePtyPackageRoot: "C:/app/node_modules/node-pty",
			pathExists: async (targetPath: string): Promise<boolean> => {
				const normalizedPath: string = normalizePathForTest(targetPath);
				return normalizedPath.endsWith("/build/Release/conpty.node")
					|| normalizedPath.endsWith("/prebuilds/win32-x64/conpty.node")
					|| normalizedPath.endsWith("/prebuilds/win32-x64/conpty/conpty.dll");
			}
		})).resolves.toBe(false);
	});

	it("enables bundled ConPTY only when the selected native module has a sibling DLL", async () => {
		await expect(shouldUseBundledConptyDll({
			platform: "win32",
			arch: "x64",
			nodePtyPackageRoot: "C:/app/node_modules/node-pty",
			pathExists: async (targetPath: string): Promise<boolean> => {
				const normalizedPath: string = normalizePathForTest(targetPath);
				return normalizedPath.endsWith("/prebuilds/win32-x64/conpty.node")
					|| normalizedPath.endsWith("/prebuilds/win32-x64/conpty/conpty.dll");
			}
		})).resolves.toBe(true);
	});

	it("creates a singleton PowerShell pty and proxies write and resize", async () => {
		const workspaceRoot: string = mkdtempSync(join(tmpdir(), "daedalus-studio-terminal-"));
		const fakePty = new FakePty();
		const spawned: Array<{ file: string; args: string[]; options: TerminalSpawnOptions }> = [];
		const service = new TerminalPtyService({
			platform: "win32",
			env: {
				HOMEDRIVE: "C:",
				HOMEPATH: "/Users/tester"
			},
			findOnPath: async (command: string): Promise<string | null> => command === "pwsh.exe" ? "C:/Program Files/PowerShell/7/pwsh.exe" : null,
			pathExists: async (): Promise<boolean> => false,
			pathIsDirectory: async (targetPath: string): Promise<boolean> => targetPath === resolve(workspaceRoot),
			spawnPty(file: string, args: string[], options: TerminalSpawnOptions): TerminalPtyProcess {
				spawned.push({ file, args, options });
				return fakePty;
			},
			sendEvent: (): void => {}
		});

		const state = await service.create({
			cwd: workspaceRoot,
			cols: 120,
			rows: 32
		});

		expect(state).toEqual({
			terminalId: "primary",
			shell: "C:/Program Files/PowerShell/7/pwsh.exe",
			cwd: resolve(workspaceRoot),
			running: true
		});
		expect(spawned).toHaveLength(1);
		expect(spawned[0]?.args).toEqual(["-NoLogo"]);
		expect(spawned[0]?.options).toMatchObject({
			cols: 120,
			rows: 32,
			cwd: resolve(workspaceRoot),
			useConptyDll: false
		});

		expect(service.write({ terminalId: "primary", data: "Get-Location\r" })).toEqual({ written: true });
		expect(service.resize({ terminalId: "primary", cols: 90, rows: 20 })).toEqual({ resized: true });
		expect(fakePty.writes).toEqual(["Get-Location\r"]);
		expect(fakePty.resizes).toEqual([{ cols: 90, rows: 20 }]);

		await expect(service.create({ cwd: workspaceRoot, cols: 80, rows: 24 })).resolves.toEqual(state);
		expect(spawned).toHaveLength(1);
	});

	it("keeps independent ptys for explicit terminal ids", async () => {
		const workspaceRoot: string = mkdtempSync(join(tmpdir(), "daedalus-studio-terminal-"));
		const firstPty = new FakePty();
		const secondPty = new FakePty();
		const ptys: FakePty[] = [firstPty, secondPty];
		const spawned: Array<{ file: string; args: string[]; options: TerminalSpawnOptions }> = [];
		const service = new TerminalPtyService({
			platform: "win32",
			findOnPath: async (): Promise<string | null> => "powershell.exe",
			pathIsDirectory: async (targetPath: string): Promise<boolean> => targetPath === resolve(workspaceRoot),
			spawnPty(file: string, args: string[], options: TerminalSpawnOptions): TerminalPtyProcess {
				spawned.push({ file, args, options });
				return ptys.shift() ?? new FakePty();
			},
			sendEvent: (): void => {}
		});

		await expect(service.create({
			terminalId: "terminal:1",
			cwd: workspaceRoot,
			cols: 80,
			rows: 24
		})).resolves.toMatchObject({
			terminalId: "terminal:1",
			running: true
		});
		await expect(service.create({
			terminalId: "terminal:2",
			cwd: workspaceRoot,
			cols: 100,
			rows: 30
		})).resolves.toMatchObject({
			terminalId: "terminal:2",
			running: true
		});

		expect(spawned).toHaveLength(2);
		expect(service.getState({ terminalId: "terminal:1" })?.terminalId).toBe("terminal:1");
		expect(service.getState({ terminalId: "terminal:2" })?.terminalId).toBe("terminal:2");

		expect(service.write({ terminalId: "terminal:2", data: "Get-Location\r" })).toEqual({ written: true });
		expect(secondPty.writes).toEqual(["Get-Location\r"]);
		expect(firstPty.writes).toEqual([]);

		expect(service.kill({ terminalId: "terminal:1" })).toEqual({ killed: true });
		expect(firstPty.killCount).toBe(1);
		expect(secondPty.killCount).toBe(0);
		expect(service.getState({ terminalId: "terminal:1" })).toBeNull();
		expect(service.getState({ terminalId: "terminal:2" })?.running).toBe(true);
	});

	it("clears terminal state on exit and kill", async () => {
		const workspaceRoot: string = mkdtempSync(join(tmpdir(), "daedalus-studio-terminal-"));
		const firstPty = new FakePty();
		const secondPty = new FakePty();
		const ptys: FakePty[] = [firstPty, secondPty];
		const events: Array<{ channel: string; payload: TerminalExitEvent }> = [];
		const service = new TerminalPtyService({
			platform: "win32",
			findOnPath: async (): Promise<string | null> => null,
			pathIsDirectory: async (targetPath: string): Promise<boolean> => targetPath === resolve(workspaceRoot),
			spawnPty: (): TerminalPtyProcess => ptys.shift() ?? new FakePty(),
			sendEvent(channel, payload): void {
				if (channel === "terminal:exit") {
					events.push({ channel, payload: payload as TerminalExitEvent });
				}
			}
		});

		await service.create({ cwd: workspaceRoot, cols: 80, rows: 24 });
		firstPty.emitExit(7);
		expect(service.getState()).toBeNull();
		expect(events.at(-1)).toEqual({
			channel: "terminal:exit",
			payload: {
				terminalId: "primary",
				exitCode: 7,
				signal: null
			}
		});

		await service.create({ cwd: workspaceRoot, cols: 80, rows: 24 });
		expect(service.kill({ terminalId: "primary" })).toEqual({ killed: true });
		expect(service.getState()).toBeNull();
		expect(secondPty.killCount).toBe(1);
		expect(events.at(-1)).toEqual({
			channel: "terminal:exit",
			payload: {
				terminalId: "primary",
				exitCode: 0,
				signal: "killed"
			}
		});
	});
});
