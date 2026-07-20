import { mkdir, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { openSessionDirectory, resolveSessionDirectory } from "@main/services/session-fs";

describe("session-fs", () => {
	it("resolves session directories inside the Daedalus sessions root", () => {
		const homeDirectory: string = "C:/Users/test";

		expect(resolveSessionDirectory("session-20260720-test", homeDirectory)).toBe(resolve(homeDirectory, ".daedalus", "sessions", "session-20260720-test"));
	});

	it("rejects invalid session ids", () => {
		const homeDirectory: string = "C:/Users/test";

		expect(() => resolveSessionDirectory("../session-escape", homeDirectory)).toThrow("Invalid session id");
		expect(() => resolveSessionDirectory("not-a-session", homeDirectory)).toThrow("Invalid session id");
	});

	it("opens an existing session directory with the provided opener", async () => {
		const homeDirectory: string = mkdtempSync(join(tmpdir(), "daedalus-studio-home-"));
		const sessionId: string = "session-20260720-open";
		const sessionDirectory: string = join(homeDirectory, ".daedalus", "sessions", sessionId);
		const openedPaths: string[] = [];

		await mkdir(sessionDirectory, { recursive: true });

		await expect(openSessionDirectory(sessionId, {
			homeDirectory,
			openPath: async (targetPath: string): Promise<string> => {
				openedPaths.push(targetPath);
				return "";
			}
		})).resolves.toEqual({ opened: true });
		expect(openedPaths).toEqual([resolve(sessionDirectory)]);
	});

	it("rejects a session path that is not a directory", async () => {
		const homeDirectory: string = mkdtempSync(join(tmpdir(), "daedalus-studio-home-"));
		const sessionId: string = "session-20260720-file";
		const sessionFilePath: string = join(homeDirectory, ".daedalus", "sessions", sessionId);

		await mkdir(join(homeDirectory, ".daedalus", "sessions"), { recursive: true });
		await writeFile(sessionFilePath, "not a directory", "utf8");

		await expect(openSessionDirectory(sessionId, {
			homeDirectory,
			openPath: async (): Promise<string> => ""
		})).rejects.toThrow("not a directory");
	});

	it("surfaces session directory opener errors", async () => {
		const homeDirectory: string = mkdtempSync(join(tmpdir(), "daedalus-studio-home-"));
		const sessionId: string = "session-20260720-opener-error";
		const sessionDirectory: string = join(homeDirectory, ".daedalus", "sessions", sessionId);

		await mkdir(sessionDirectory, { recursive: true });

		await expect(openSessionDirectory(sessionId, {
			homeDirectory,
			openPath: async (): Promise<string> => "explorer failed"
		})).rejects.toThrow("explorer failed");
	});
});
