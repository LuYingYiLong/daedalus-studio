import { readFile } from "node:fs/promises";
import { execFileSync, type ChildProcess } from "node:child_process";
import type { ElectronApplication } from "@playwright/test";

export function validateElectronHealth(log: string): void {
  const entries: { kind: string; detail: string }[] = log
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (!entries.some((entry) => entry.kind === "monitorReady")) {
    throw new Error("Electron health monitor did not start");
  }
  const errors = entries.filter(
    (entry) => !["monitorReady", "willQuit"].includes(entry.kind),
  );
  if (errors.length)
    throw new Error(
      `Electron Main errors (including teardown):\n${errors.map((entry) => `${entry.kind}: ${entry.detail}`).join("\n")}`,
    );
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

export async function closeElectronAndCheckHealth(
  application: ElectronApplication,
  healthLog: string,
  rendererErrors: readonly string[],
  timeoutMs = 10_000,
): Promise<void> {
  const child = application.process();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onExit: (() => void) | undefined;
  const failures: string[] = [];
  try {
    const exited = hasExited(child)
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          onExit = resolve;
          child.once("exit", onExit);
        });
    await Promise.race([
      Promise.all([application.close(), exited]),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Electron did not close gracefully within ${timeoutMs}ms`,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    failures.push(String(error));
    if (!hasExited(child)) {
      // Cleanup only the process tree launched by this fixture. A forced kill is a failure.
      try {
        if (process.platform === "win32" && child.pid) {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
            timeout: 5000,
          });
        } else child.kill("SIGKILL");
      } catch (cleanupError) {
        if (!hasExited(child))
          failures.push(`Electron cleanup failed: ${String(cleanupError)}`);
      }
    }
  } finally {
    clearTimeout(timer);
    if (onExit) child.off("exit", onExit);
  }
  if (child.exitCode !== 0)
    failures.push(
      `Electron exit code: ${child.exitCode}; signal: ${child.signalCode}`,
    );
  try {
    validateElectronHealth(await readFile(healthLog, "utf8"));
  } catch (error) {
    failures.push(String(error));
  }
  failures.push(
    ...rendererErrors.map((error) => `Renderer exception: ${error}`),
  );
  if (failures.length) throw new Error(failures.join("\n\n"));
}
