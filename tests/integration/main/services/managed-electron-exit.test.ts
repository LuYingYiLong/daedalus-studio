import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it.skipIf(process.platform !== "win32")("closing a real Electron window also exits the Windows job supervisor", async () => {
	const profile = await mkdtemp(join(tmpdir(), "daedalus-supervised-electron-"));
	const child = spawn(process.execPath, [resolve("tests/fixtures/process-supervisor/electron-launcher.cjs"), profile], {
		stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
	});
	let stdout = ""; let stderr = "";
	let deadline: ReturnType<typeof setTimeout> | undefined;
	child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
	child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
	try {
		const [code] = await Promise.race([
			once(child, "exit"),
			new Promise<never>((_resolve, reject) => {
				deadline = setTimeout(() => reject(new Error(`Supervised Electron did not exit: ${stderr}`)), 15_000);
			}),
		]);
		expect(code, stderr).toBe(0);
		expect(stdout).toContain("supervised-electron-renderer-ready");
	} finally {
		clearTimeout(deadline);
		if (child.exitCode === null && child.signalCode === null) child.kill();
		await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
	}
}, 20_000);
