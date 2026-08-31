import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test, expect } from "./fixtures/studio";
import { validateElectronHealth } from "./fixtures/electron-health";

test("a second Studio instance quits before ready without native alerts", async ({ launchStudio }, testInfo) => {
  const { electronApp, mainWindow } = await launchStudio();
  // Normal E2E launches bypass the lock. Acquire it for this scenario so the
  // second process exercises the same early-quit path as dev beside a release.
  const first = await electronApp.evaluate(({ app }) => ({
    acquired: app.requestSingleInstanceLock(),
    userData: app.getPath("userData"),
    env: { ...process.env },
  }));
  expect(first.acquired).toBe(true);
  const healthLog = testInfo.outputPath("second-instance-health.jsonl");
  const env: Record<string, string | undefined> = { ...first.env, DAEDALUS_E2E_HEALTH_LOG: healthLog };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const executable = createRequire(__filename)("electron") as string;
  const output: string[] = [];
  const child = spawn(executable, [
    "-r", join(__dirname, "fixtures", "electron-second-instance.cjs"),
    "--disable-gpu", "--disable-software-rasterizer", "--in-process-gpu",
    resolve(__dirname, "../../out/main/index.js"),
    `--user-data-dir=${first.userData}`,
  ], {
    cwd: resolve(__dirname, "../.."), env, windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"], timeout: 15_000, killSignal: "SIGKILL",
  });
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  try {
    const result = await new Promise<{ code: number | null; signal: string | null }>((resolveExit, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolveExit({ code, signal }));
    });
    expect(result, output.join("")).toEqual({ code: 0, signal: null });
    expect(JSON.parse(await readFile(`${healthLog}.startup.json`, "utf8"))).toEqual({
      ready: false, hasLock: false, windowCount: 0,
    });
    const health = await readFile(healthLog, "utf8");
    validateElectronHealth(health);
    expect(health).toContain('"willQuit"');
    expect(mainWindow.isClosed()).toBe(false);
    expect(await electronApp.evaluate(({ app }) => app.hasSingleInstanceLock())).toBe(true);
  } finally {
    await testInfo.attach("second-instance-output", { body: output.join(""), contentType: "text/plain" });
    await testInfo.attach("second-instance-health", { path: healthLog, contentType: "application/x-ndjson" });
  }
});
