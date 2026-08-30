import { fork, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const owned: ChildProcess[] = [];
afterEach(() => { for (const child of owned.splice(0)) if (child.exitCode === null) child.kill(); });
const launcher = resolve("tests/fixtures/process-supervisor/launcher.cjs");
const tree = resolve("tests/fixtures/process-supervisor/tree.cjs");
function alive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}
async function start(args: string[]) {
	const child = fork(launcher, args, { stdio: ["ignore", "pipe", "pipe", "ipc"], execArgv: [] });
	owned.push(child);
	let output = ""; let errors = "";
	child.stdout!.on("data", (data: Buffer) => { output += data.toString(); });
	child.stderr!.on("data", (data: Buffer) => { errors += data.toString(); });
	return { child, output: () => output, errors: () => errors, exit: once(child, "exit") };
}

describe("development command supervisor", () => {
	it("preserves argv (Unicode, spaces, quotes and backslashes) and exit status", async () => {
		const args = ["中文 路径", 'a"b', "C:\\trailing path\\", "", "x&y"];
		const run = await start(["-e", "console.log(JSON.stringify(process.argv.slice(1)));process.exit(23)", "--", ...args]);
		expect((await run.exit)[0], run.errors()).toBe(23);
		expect(JSON.parse(run.output())).toEqual(args);
	}, 20_000);

	// Windows Job Object also includes descendants that request detached:true.
	it.skipIf(process.platform !== "win32")("reaps descendants when the command exits abnormally", async () => {
		const run = await start([tree, "exit"]);
		expect((await run.exit)[0], run.errors()).toBe(17);
		const ids = run.output().trim().split(/\r?\n/u).map((line) => JSON.parse(line) as { root?: number; leaf?: number });
		expect(ids).toHaveLength(2);
		for (const item of ids) await expect.poll(() => alive((item.root ?? item.leaf)!)).toBe(false);
	}, 20_000);

	for (const mode of ["interrupt", "parent-killed"] as const) {
		it.skipIf(process.platform !== "win32")(`reaps only its own tree after ${mode}`, async () => {
			const unrelated = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore", windowsHide: true });
			owned.push(unrelated);
			const run = await start([tree]);
			await expect.poll(() => run.output(), { timeout: 15_000 }).toContain('"leaf"');
			const ids = run.output().trim().split(/\r?\n/u).map((line) => JSON.parse(line) as { root?: number; leaf?: number });
			if (mode === "interrupt") run.child.send("interrupt");
			else run.child.kill();
			const [code] = await run.exit;
			if (mode === "interrupt") expect(code, run.errors()).toBe(130);
			for (const item of ids) await expect.poll(() => alive((item.root ?? item.leaf)!), { timeout: 5_000 }).toBe(false);
			expect(alive(unrelated.pid!)).toBe(true);
		}, 25_000);
	}
});
