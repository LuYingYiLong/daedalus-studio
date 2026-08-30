import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import type { ElectronApplication } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeElectronAndCheckHealth,
  validateElectronHealth,
} from "../../e2e/fixtures/electron-health";

const readyLog = JSON.stringify({ kind: "monitorReady", detail: "" }) + "\n";
const directories: string[] = [];
async function healthLog(log = readyLog) {
  const directory = await mkdtemp(join(tmpdir(), "electron-health-test-"));
  directories.push(directory);
  const path = join(directory, "main.jsonl");
  await writeFile(path, log);
  return path;
}
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Electron E2E health gate", () => {
  it("installs before Main and records native error boxes instead of blocking the test", () => {
    const originalDialog = vi.fn();
    const dialog = { showErrorBox: originalDialog };
    const app = Object.assign(new EventEmitter(), { isPackaged: false });
    const testProcess = Object.assign(new EventEmitter(), {
      env: { DAEDALUS_E2E: "1", DAEDALUS_E2E_HEALTH_LOG: "fixture.jsonl" },
    });
    let log = "";
    runInNewContext(
      readFileSync(
        new URL("../../e2e/fixtures/electron-health.cjs", import.meta.url),
        "utf8",
      ),
      {
        process: testProcess,
        require: (name: string) => {
          if (name === "electron") return { app, dialog };
          if (name === "node:fs")
            return {
              appendFileSync: (_path: string, chunk: string) => {
                log += chunk;
              },
            };
          throw new Error(`Unexpected import: ${name}`);
        },
      },
    );
    validateElectronHealth(log);
    expect(testProcess.listenerCount("uncaughtException")).toBe(0);
    testProcess.emit("uncaughtExceptionMonitor", new Error("startup fixture"));
    app.emit("will-quit");
    dialog.showErrorBox("Main error", "destroyed during teardown");
    testProcess.emit(
      "unhandledRejection",
      new Error("late resource verification"),
    );
    expect(originalDialog).not.toHaveBeenCalled();
    expect(() => validateElectronHealth(log)).toThrow("startup fixture");
    expect(() => validateElectronHealth(log)).toThrow(
      "destroyed during teardown",
    );
    expect(() => validateElectronHealth(log)).toThrow(
      "late resource verification",
    );
  });

  it("fails when monitoring is missing or the health log is malformed", () => {
    expect(() => validateElectronHealth("")).toThrow("did not start");
    expect(() => validateElectronHealth("not json")).toThrow();
  });

  it("checks exceptions written during close, even after successful UI assertions", async () => {
    const path = await healthLog();
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      signalCode: null,
    });
    const app = {
      process: () => child,
      close: async () => {
        await writeFile(
          path,
          readyLog +
            JSON.stringify({
              kind: "uncaughtException",
              detail: "Object has been destroyed",
            }),
        );
        child.exitCode = 0;
        child.emit("exit", 0);
      },
    } as unknown as ElectronApplication;
    await expect(closeElectronAndCheckHealth(app, path, [])).rejects.toThrow(
      "Object has been destroyed",
    );
  });

  it("fails a stuck close and kills only its own child instead of passing", async () => {
    const path = await healthLog();
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      signalCode: null,
      kill: vi.fn(() => {
        child.exitCode = 1;
        child.emit("exit", 1);
      }),
    });
    const app = {
      process: () => child,
      close: () => new Promise<void>(() => {}),
    } as unknown as ElectronApplication;
    const closed = expect(
      closeElectronAndCheckHealth(app, path, [], 50),
    ).rejects.toThrow("did not close gracefully");
    await vi.advanceTimersByTimeAsync(50);
    await closed;
    expect(child.kill).toHaveBeenCalledOnce();
    expect(child.listenerCount("exit")).toBe(0);
  });

  it("requires a clean exit and no renderer exceptions", async () => {
    const path = await healthLog();
    const child = { exitCode: 0, signalCode: null };
    const app = {
      process: () => child,
      close: async () => {},
    } as unknown as ElectronApplication;
    await expect(
      closeElectronAndCheckHealth(app, path, []),
    ).resolves.toBeUndefined();
    await expect(
      closeElectronAndCheckHealth(app, path, ["pageerror fixture"]),
    ).rejects.toThrow("pageerror fixture");
    child.exitCode = 1;
    await expect(closeElectronAndCheckHealth(app, path, [])).rejects.toThrow(
      "Electron exit code: 1",
    );
  });
});
