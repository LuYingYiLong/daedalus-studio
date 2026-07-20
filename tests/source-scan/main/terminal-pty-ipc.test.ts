import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("terminal pty main process source", () => {
	const mainSource: string = readRepoFile("src", "main", "index.ts");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");
	const serviceSource: string = readRepoFile("src", "main", "services", "terminal-pty.ts");
	const viteConfigSource: string = readRepoFile("electron.vite.config.ts");
	const builderConfigSource: string = readRepoFile("electron-builder.yml");

	it("registers terminal IPC and cleans up pty processes on app quit", () => {
		expect(mainSource).toContain("registerTerminalPtyIpc");
		expect(mainSource).toContain("terminalPtyService.dispose();");
		expect(serviceSource).toContain("ipcMain.handle(\"terminal:create\"");
		expect(serviceSource).toContain("ipcMain.handle(\"terminal:write\"");
		expect(serviceSource).toContain("ipcMain.handle(\"terminal:resize\"");
		expect(serviceSource).toContain("ipcMain.handle(\"terminal:kill\"");
		expect(serviceSource).toContain("ipcMain.handle(\"terminal:get-state\"");
		expect(serviceSource).toContain("this.sendEvent(\"terminal:data\"");
		expect(serviceSource).toContain("this.sendEvent(\"terminal:exit\"");
	});

	it("exposes terminal APIs through preload without renderer node-pty access", () => {
		expect(preloadSource).toContain("terminal: {");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"terminal:create\", params)");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"terminal:write\", params)");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"terminal:resize\", params)");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"terminal:kill\", params)");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"terminal:get-state\", params)");
		expect(preloadSource).toContain("ipcRenderer.on(\"terminal:data\", handler)");
		expect(preloadSource).toContain("ipcRenderer.on(\"terminal:exit\", handler)");
		expect(preloadSource).not.toContain("node-pty");
	});

	it("keeps node-pty in main and unpacks the native module for production builds", () => {
		expect(serviceSource).toContain("await import(\"node-pty\")");
		expect(serviceSource).toContain("private readonly activeTerminals: Map<string, ActiveTerminal> = new Map();");
		expect(serviceSource).toContain("function normalizeTerminalId");
		expect(viteConfigSource).toContain("external: [\"node-pty\"]");
		expect(builderConfigSource).toContain("asarUnpack:");
		expect(builderConfigSource).toContain("node_modules/node-pty/**/*");
	});
});
