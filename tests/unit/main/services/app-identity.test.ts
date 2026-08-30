import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	app: { isPackaged: false, getAppPath: vi.fn() },
	existsSync: vi.fn(),
	createFromPath: vi.fn(),
}));

vi.mock("electron", () => ({ app: mocks.app, nativeImage: { createFromPath: mocks.createFromPath } }));
vi.mock("node:fs", () => ({ existsSync: mocks.existsSync }));

import { getAppIconImage, getAppIconPath } from "@main/services/app-identity";

describe("application icon paths", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.app.isPackaged = false;
		mocks.app.getAppPath.mockReturnValue(join("studio"));
		mocks.existsSync.mockReturnValue(true);
	});

	afterEach(() => vi.unstubAllGlobals());

	it("loads the tracked icon when launched from the project root", () => {
		expect(getAppIconPath()).toBe(join("studio", "build/icon.ico"));
	});

	it("resolves a directly launched out/main entry back to the project root", () => {
		mocks.app.getAppPath.mockReturnValue(join("studio", "out", "main"));
		expect(getAppIconPath()).toBe(join("studio", "build/icon.ico"));
	});

	it("uses the external resources icon for a packaged app", () => {
		mocks.app.isPackaged = true;
		vi.stubGlobal("process", { ...process, resourcesPath: join("installed", "resources") });
		expect(getAppIconPath()).toBe(join("installed", "resources", "icon.ico"));
	});

	it("handles missing or undecodable resources without passing an empty tray icon", () => {
		mocks.existsSync.mockReturnValue(false);
		expect(getAppIconImage()).toBeNull();
		expect(mocks.createFromPath).not.toHaveBeenCalled();
		mocks.existsSync.mockReturnValue(true);
		mocks.createFromPath.mockReturnValue({ isEmpty: () => true });
		expect(getAppIconImage()).toBeNull();
	});
});
