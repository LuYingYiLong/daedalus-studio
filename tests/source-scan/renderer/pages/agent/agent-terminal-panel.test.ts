import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("AgentPage terminal panel source", () => {
	const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");
	const terminalPanelSource: string = readRepoFile("src", "renderer", "src", "features", "terminal", "TerminalPanel.tsx");
	const dockPanelTabsSource: string = readRepoFile("src", "renderer", "src", "features", "dock", "DockPanelTabs.tsx");
	const panelTabsSource: string = readRepoFile("src", "renderer", "src", "features", "panel-tabs", "PanelTabs.tsx");
	const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");

	it("wraps chat and side dock inside a vertical Splitter for the bottom dock", () => {
		expect(agentSource).toContain("className={styles.agentVerticalSplitter}");
		expect(agentSource).toContain("orientation=\"vertical\"");
		expect(agentSource).toContain("onResize={handleBottomDockResize}");
		expect(agentSource).toContain("onResizeEnd={handleBottomDockResizeEnd}");
		expect(agentSource).toContain("BOTTOM_DOCK_DEFAULT_SIZE");
		expect(agentSource).toContain("BOTTOM_DOCK_CLOSE_THRESHOLD");
		expect(agentSource).toContain("<DockPanelTabs");
		expect(agentSource).toContain("dockId=\"bottom\"");
		expect(agentSource).toContain("placement=\"bottom\"");
		expect(agentSource).toContain("cwd={activeWorkspace?.rootPath ?? null}");
		expect(agentSource).toContain("isOpen={bottomDockOpen}");
		expect(agentSource).toContain("defaultKind=\"terminal\"");
		expect(agentSource).toContain("onEmpty={closeBottomDock}");
	});

	it("keeps side defaulting to review and bottom defaulting to terminal", () => {
		expect(agentSource).toContain("defaultKind=\"review\"");
		expect(agentSource).toContain("defaultKind=\"terminal\"");
		expect(dockPanelTabsSource).toContain("return [createDockTab(dockId, defaultKind, 1)];");
		expect(dockPanelTabsSource).not.toContain("getDefaultAvailableKind");
	});

	it("closes the bottom panel while dragging below the threshold", () => {
		const resizeStart: number = agentSource.indexOf("function handleBottomDockResize(sizes: number[]): void");
		const resizeEnd: number = agentSource.indexOf("function handleBottomDockResizeEnd(sizes: number[]): void");
		const resizeSource: string = agentSource.slice(resizeStart, resizeEnd);

		expect(resizeStart).toBeGreaterThan(-1);
		expect(resizeEnd).toBeGreaterThan(resizeStart);
		expect(resizeSource).toContain("normalizedSize < BOTTOM_DOCK_CLOSE_THRESHOLD");
		expect(resizeSource).toContain("closeBottomDock();");
	});

	it("places layout-bottom before layout-right and uses it as the panel switch", () => {
		const bottomButtonIndex: number = agentSource.indexOf("icon={<Icon name=\"layout-bottom\" />}");
		const rightButtonIndex: number = agentSource.indexOf("icon={<Icon name=\"layout-right\" />}");

		expect(agentSource).toContain("const showDockControls: boolean = !isHome || activeWorkspace !== null;");
		expect(agentSource).toContain("const showBottomDockButton: boolean = showDockControls;");
		expect(bottomButtonIndex).toBeGreaterThan(-1);
		expect(rightButtonIndex).toBeGreaterThan(-1);
		expect(bottomButtonIndex).toBeLessThan(rightButtonIndex);
		expect(agentSource).toContain("onClick={toggleBottomDock}");
		expect(agentSource).toContain("aria-pressed={bottomDockOpen}");
	});

	it("uses xterm, FitAddon and the preload terminal API", () => {
		expect(terminalPanelSource).toContain("from \"@xterm/xterm\"");
		expect(terminalPanelSource).toContain("from \"@xterm/addon-fit\"");
		expect(terminalPanelSource).toContain("@xterm/xterm/css/xterm.css");
		expect(terminalPanelSource).toContain("new Terminal(");
		expect(terminalPanelSource).toContain("new FitAddon()");
		expect(terminalPanelSource).toContain("terminal.onData");
		expect(terminalPanelSource).toContain("window.electronAPI.terminal.write");
		expect(terminalPanelSource).toContain("window.electronAPI.terminal.resize");
		expect(terminalPanelSource).toContain("window.electronAPI.terminal.getState");
		expect(terminalPanelSource).toContain("window.electronAPI.terminal.create");
		expect(terminalPanelSource).toContain("window.electronAPI.terminal.onData");
		expect(terminalPanelSource).toContain("window.electronAPI.terminal.onExit");
	});

	it("waits for the session workspace cwd before creating a terminal", () => {
		const waitGuardIndex: number = terminalPanelSource.indexOf("waitForCwdRef.current && cwdRef.current === null");
		const createIndex: number = terminalPanelSource.indexOf("window.electronAPI.terminal.create");

		expect(agentSource).toContain("const terminalWaitForCwd: boolean = !isHome && isSessionLoading && activeWorkspace === null;");
		expect(agentSource).toContain("waitForCwd={terminalWaitForCwd}");
		expect(dockPanelTabsSource).toContain("waitForCwd: boolean;");
		expect(dockPanelTabsSource).toContain("waitForCwd={waitForCwd}");
		expect(terminalPanelSource).toContain("Waiting for workspace");
		expect(waitGuardIndex).toBeGreaterThan(-1);
		expect(createIndex).toBeGreaterThan(-1);
		expect(waitGuardIndex).toBeLessThan(createIndex);
	});

	it("renders dock tabs that can add both terminal and review panels", () => {
		expect(panelTabsSource).toContain("type=\"editable-card\"");
		expect(panelTabsSource).toContain("hideAdd={true}");
		expect(panelTabsSource).toContain("tabBarExtraContent={{");
		expect(panelTabsSource).toContain("<Dropdown");
		expect(dockPanelTabsSource).toContain("PanelTabs");
		expect(dockPanelTabsSource).toContain("Review panel");
		expect(dockPanelTabsSource).toContain("Terminal panel");
		expect(dockPanelTabsSource).toContain("forceRender: tab.kind === \"terminal\"");
		expect(dockPanelTabsSource).toContain("window.electronAPI.terminal.kill({ terminalId: targetKey })");
		expect(dockPanelTabsSource).toContain("onEmpty();");
		expect(dockPanelTabsSource).toContain("terminalId={tab.key}");
		expect(dockPanelTabsSource).toContain("<GitDiffReviewPanel workspaceId={workspaceId} />");
		expect(dockPanelTabsSource).toContain("onReorder={reorderDockTab}");
		expect(terminalPanelSource).not.toContain("Tabs");
	});

	it("keeps PowerShell history predictions readable in light terminal themes", () => {
		expect(terminalPanelSource).toContain("const isLightTheme: boolean = document.documentElement.dataset.theme === \"light\";");
		expect(terminalPanelSource).toContain("black: isLightTheme ? getCssVar(\"--ds-text-primary\", \"#141414\") : getCssVar(\"--ds-bg\", \"#141414\")");
		expect(terminalPanelSource).toContain("brightBlack: isLightTheme ? getCssVar(\"--ds-text-secondary\", \"#4f4f4f\") : getCssVar(\"--ds-text-muted\", \"#8c8c8c\")");
		expect(terminalPanelSource).toContain("new MutationObserver");
		expect(terminalPanelSource).toContain("terminal.options.theme = createTerminalTheme();");
	});

	it("declares the preload terminal interface for renderer code", () => {
		expect(viteEnvSource).toContain("interface TerminalAPI");
		expect(viteEnvSource).toContain("create: (params: { terminalId?: string | null; cwd?: string | null; cols: number; rows: number }) => Promise<TerminalState>;");
		expect(viteEnvSource).toContain("getState: (params?: { terminalId?: string | null }) => Promise<TerminalState | null>;");
		expect(viteEnvSource).toContain("onData: (callback: (event: TerminalDataEvent) => void) => () => void;");
		expect(viteEnvSource).toContain("terminal: TerminalAPI;");
	});
});
