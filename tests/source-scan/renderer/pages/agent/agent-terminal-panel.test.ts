import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("AgentPage terminal panel source", () => {
	const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");
	const terminalPanelSource: string = readRepoFile("src", "renderer", "src", "features", "terminal", "TerminalPanel.tsx");
	const terminalPanelTabsSource: string = readRepoFile("src", "renderer", "src", "features", "terminal", "TerminalPanelTabs.tsx");
	const panelTabsSource: string = readRepoFile("src", "renderer", "src", "features", "panel-tabs", "PanelTabs.tsx");
	const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");

	it("wraps chat and review inside a vertical Splitter for the bottom terminal", () => {
		expect(agentSource).toContain("className={styles.agentVerticalSplitter}");
		expect(agentSource).toContain("orientation=\"vertical\"");
		expect(agentSource).toContain("onResize={handleTerminalResize}");
		expect(agentSource).toContain("onResizeEnd={handleTerminalResizeEnd}");
		expect(agentSource).toContain("TERMINAL_PANEL_DEFAULT_SIZE");
		expect(agentSource).toContain("TERMINAL_PANEL_CLOSE_THRESHOLD");
		expect(agentSource).toContain("<TerminalPanelTabs");
		expect(agentSource).toContain("cwd={activeWorkspace?.rootPath ?? null}");
		expect(agentSource).toContain("isOpen={terminalPanelOpen}");
		expect(agentSource).toContain("onEmpty={closeTerminalPanel}");
	});

	it("closes the bottom panel while dragging below the threshold", () => {
		const resizeStart: number = agentSource.indexOf("function handleTerminalResize(sizes: number[]): void");
		const resizeEnd: number = agentSource.indexOf("function handleTerminalResizeEnd(sizes: number[]): void");
		const resizeSource: string = agentSource.slice(resizeStart, resizeEnd);

		expect(resizeStart).toBeGreaterThan(-1);
		expect(resizeEnd).toBeGreaterThan(resizeStart);
		expect(resizeSource).toContain("normalizedSize < TERMINAL_PANEL_CLOSE_THRESHOLD");
		expect(resizeSource).toContain("closeTerminalPanel();");
	});

	it("places layout-bottom before layout-right and uses it as the panel switch", () => {
		const bottomButtonIndex: number = agentSource.indexOf("icon={<Icon name=\"layout-bottom\" />}");
		const rightButtonIndex: number = agentSource.indexOf("icon={<Icon name=\"layout-right\" />}");

		expect(agentSource).toContain("const showTerminalButton: boolean = !isHome;");
		expect(bottomButtonIndex).toBeGreaterThan(-1);
		expect(rightButtonIndex).toBeGreaterThan(-1);
		expect(bottomButtonIndex).toBeLessThan(rightButtonIndex);
		expect(agentSource).toContain("onClick={toggleTerminalPanel}");
		expect(agentSource).toContain("aria-pressed={terminalPanelOpen}");
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

	it("renders terminal content through reusable editable tabs with an add dropdown", () => {
		expect(panelTabsSource).toContain("type=\"editable-card\"");
		expect(panelTabsSource).toContain("hideAdd={true}");
		expect(panelTabsSource).toContain("tabBarExtraContent={{");
		expect(panelTabsSource).toContain("<Dropdown");
		expect(terminalPanelTabsSource).toContain("PanelTabs");
		expect(terminalPanelTabsSource).toContain("addItems");
		expect(terminalPanelTabsSource).toContain("addLabel=\"Add terminal panel\"");
		expect(terminalPanelTabsSource).toContain("forceRender: true");
		expect(terminalPanelTabsSource).toContain("window.electronAPI.terminal.kill({ terminalId: targetKey })");
		expect(terminalPanelTabsSource).toContain("onEmpty();");
		expect(terminalPanelTabsSource).toContain("terminalId={tab.key}");
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
