import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("browser service security boundary", () => {
	it("keeps remote pages sandboxed and outside the Daedalus preload", () => {
		const source = readRepoFile("src", "main", "services", "browser", "browser-service.ts");
		expect(source).toContain("sandbox: true");
		expect(source).toContain("contextIsolation: true");
		expect(source).toContain("nodeIntegration: false");
		expect(source).toContain("webSecurity: true");
		expect(source).toContain('partition: BROWSER_PARTITION');
		expect(source).toContain('setWindowOpenHandler');
		expect(source).toContain('browser_sender_not_allowed');
	});

	it("allows only HTTP navigation and denies unsupported site and device permissions", () => {
		const source = readRepoFile("src", "main", "services", "browser", "browser-service.ts");
		expect(source).toContain('parsed.protocol !== "https:" && parsed.protocol !== "http:"');
		expect(source).toContain("SUPPORTED_PERMISSIONS.has(permission)");
		expect(source).toContain("setDevicePermissionHandler");
	});

	it("captures a safe visual fallback before renderer overlays occlude the native view", () => {
		const source = readRepoFile("src", "main", "services", "browser", "browser-service.ts");
		expect(source).toContain('ipcMain.handle("browser:view-capture"');
		expect(source).toContain("record.view.webContents.capturePage()");
		expect(source).toContain("this.requireOwnedRecord(event, payload)");
	});
});
