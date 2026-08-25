import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { test as base, expect, type ElectronApplication, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { MockBackend } from "./mock-backend";

const repositoryRoot: string = resolve(__dirname, "..", "..", "..");
const builtEntryPoint: string = join(repositoryRoot, "out", "main", "index.js");
const electronExecutablePath: string = createRequire(__filename)("electron") as string;

export type LaunchOptions = {
	completedOnboarding?: boolean;
};

export type LaunchedStudio = {
	electronApp: ElectronApplication;
	mainWindow: Page;
};

export type StudioFixtures = {
	mockBackend: MockBackend;
	userDataDir: string;
	launchStudio: (options?: LaunchOptions) => Promise<LaunchedStudio>;
};

function completedPreferences(): Record<string, unknown> {
	return {
		onboarding: {
			schemaVersion: 1,
			completed: true,
			currentStep: "complete",
			stepOutcomes: {},
			completedAt: "2026-08-24T00:00:00.000Z",
		},
	};
}

async function dismissReleaseNotesIfPresent(page: Page): Promise<void> {
	const acknowledgeButton = page.getByRole("button", { name: /Got it|知道了/ });
	try {
		await acknowledgeButton.click({ timeout: 5_000 });
	} catch {
		// The changelog dialog is only shown for a fresh local profile.
	}
}

export const test = base.extend<StudioFixtures>({
	mockBackend: async ({}, use): Promise<void> => {
		const backend = new MockBackend({ port: 0 });
		await backend.start();
		await use(backend);
		await backend.stop();
	},
	userDataDir: async ({}, use): Promise<void> => {
		const directory: string = await mkdtemp(join(tmpdir(), "daedalus-studio-e2e-"));
		await use(directory);
		await rm(directory, { recursive: true, force: true });
	},
	launchStudio: async ({ mockBackend, userDataDir }, use): Promise<void> => {
		let launched: LaunchedStudio | null = null;
		const launchStudio = async (options: LaunchOptions = {}): Promise<LaunchedStudio> => {
			if (launched !== null) {
				return launched;
			}
			const isolatedProfileRoot: string = join(userDataDir, "profile");
			await mkdir(isolatedProfileRoot, { recursive: true });
			if (options.completedOnboarding !== false) {
				await writeFile(
					join(isolatedProfileRoot, "client-preferences.json"),
					`${JSON.stringify(completedPreferences(), null, 2)}\n`,
					"utf8",
				);
			}
			const electronApp: ElectronApplication = await electron.launch({
				executablePath: electronExecutablePath,
				args: [builtEntryPoint, `--user-data-dir=${isolatedProfileRoot}`],
				env: {
					...process.env,
					USERPROFILE: userDataDir,
					APPDATA: join(userDataDir, "AppData", "Roaming"),
					LOCALAPPDATA: join(userDataDir, "AppData", "Local"),
					TEMP: userDataDir,
					TMP: userDataDir,
					DAEDALUS_E2E: "1",
					DAEDALUS_E2E_BACKEND_PORT: String(mockBackend.getPort()),
					ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
				},
			});
			const mainWindow: Page = await electronApp.firstWindow();
			mainWindow.on("console", (message): void => {
				console.log(`[renderer:${message.type()}] ${message.text()}`);
			});
			mainWindow.on("pageerror", (error): void => {
				console.log(`[renderer:pageerror] ${error.message}`);
			});
			await mainWindow.waitForLoadState("domcontentloaded");
			await dismissReleaseNotesIfPresent(mainWindow);
			launched = { electronApp, mainWindow };
			return launched;
		};
		await use(launchStudio);
		const completedLaunch: LaunchedStudio | null = launched as LaunchedStudio | null;
		if (completedLaunch !== null) {
			await completedLaunch.electronApp.close();
		}
	},
});

export { expect };
