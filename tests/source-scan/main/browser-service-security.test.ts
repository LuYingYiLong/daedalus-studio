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

	it("uses right click to cancel element inspection without opening a page menu", () => {
		const source = readRepoFile("src", "main", "services", "browser", "browser-inspector.ts");
		expect(source).toContain('this.webContents.on("context-menu"');
		expect(source).toContain('method === "Overlay.inspectModeCanceled"');
		expect(source).toContain("event.preventDefault()");
		expect(source).toContain("void this.cancel()");
		expect(source).toContain('this.webContents.removeListener("context-menu"');
	});

	it("shares one CDP attachment and exposes only fixed browser automation actions", () => {
		const service = readRepoFile("src", "main", "services", "browser", "browser-service.ts");
		const cdp = readRepoFile("src", "main", "services", "browser", "browser-cdp-session.ts");
		const automation = readRepoFile("src", "main", "services", "browser", "browser-automation-controller.ts");
		expect(service).toContain('ipcMain.handle("browser:automation-execute"');
		expect(service).toContain("settings.aiCdpEnabled");
		expect(cdp).toContain("private readonly leases");
		expect(cdp).toContain("async acquire(owner: string)");
		expect(automation).toContain('case "mcp_browser_observe"');
		expect(automation).toContain('case "mcp_browser_click"');
		expect(automation).toContain("browser_element_stale");
		expect(automation).not.toContain("args.script");
	});
});
