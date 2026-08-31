import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot: string = process.cwd();

function readSource(path: string): string {
	return readFileSync(join(repositoryRoot, path), "utf8");
}

function collectSourceFiles(directory: string): string[] {
	const absoluteDirectory: string = join(repositoryRoot, directory);
	const files: string[] = [];

	for (const entry of readdirSync(absoluteDirectory)) {
		const absolutePath: string = join(absoluteDirectory, entry);
		if (statSync(absolutePath).isDirectory()) {
			files.push(...collectSourceFiles(join(directory, entry)));
		} else if (/\.(ts|tsx)$/.test(entry)) {
			files.push(absolutePath);
		}
	}

	return files;
}

describe("静态架构契约", () => {
	it("维护 renderer 分层的依赖方向", () => {
		const rules: Array<{ directory: string; forbidden: RegExp }> = [
			{ directory: "domain", forbidden: /@\/(?:app|features|widgets|ui|platform\/(?:runtime|electron))\//u },
			{ directory: "features", forbidden: /@\/(?:app|widgets)\//u },
			{ directory: "widgets", forbidden: /@\/app\//u },
			{ directory: "ui", forbidden: /@\/(?:app|features|widgets)\//u },
		];
		const violations: string[] = [];
		for (const rule of rules) {
			for (const filePath of collectSourceFiles(`src/renderer/src/${rule.directory}`)) {
				const source: string = readFileSync(filePath, "utf8");
				if (rule.forbidden.test(source)) {
					violations.push(`${relative(repositoryRoot, filePath)}:${rule.directory}`);
				}
			}
		}
		expect(violations).toEqual([]);
	});

	it("Settings 页面按产品域分组，Home 仅负责页面组装", () => {
		const settingsRoot: string = join(repositoryRoot, "src/renderer/src/widgets/settings");
		const rootPages: string[] = readdirSync(settingsRoot).filter((entry: string): boolean => /SettingsPage\.tsx$/u.test(entry));
		expect(rootPages).toEqual([]);
		for (const section of ["models", "studio", "extensions", "workspace", "resources"]) {
			expect(statSync(join(settingsRoot, "pages", section)).isDirectory()).toBe(true);
		}

		const homePage: string = readSource("src/renderer/src/widgets/home/HomePage.tsx");
		expect(homePage).toContain("@/features/home/dock/useHomePageDockController");
		expect(homePage).toContain("@/features/home/surface/useHomeSurfaceController");
		const homeSurface: string = readSource("src/renderer/src/widgets/home/surface/HomeChatSurface.tsx");
		expect(homeSurface).toContain("@/widgets/session-home/NewSessionHome");
	});

	it("应用级 runtime 不重新成为业务 controller 垃圾桶", () => {
		const legacyRuntime: string = join(
			repositoryRoot,
			"src/renderer/src/app/runtime",
		);
		expect(existsSync(legacyRuntime)).toBe(false);

		const applicationHooks: string[] = collectSourceFiles(
			"src/renderer/src/features/application/hooks",
		);
		expect(applicationHooks.some((filePath: string): boolean =>
			filePath.endsWith("useAppRuntimeEventController.ts")
		)).toBe(true);

		const composerControllers: string[] = collectSourceFiles(
			"src/renderer/src/features/composer/controllers",
		);
		expect(composerControllers.some((filePath: string): boolean =>
			filePath.endsWith("useComposerRunController.ts")
		)).toBe(true);
	});

	it("所有 Electron 窗口都启用隔离并关闭 Node 集成", () => {
		const mainSource: string = readSource("src/main/index.ts");

		expect(mainSource.match(/contextIsolation\s*:\s*true/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
		expect(mainSource.match(/nodeIntegration\s*:\s*false/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
		expect(mainSource).not.toMatch(/nodeIntegration\s*:\s*true/);
	});

	it("renderer 只能通过 preload 边界访问桌面能力", () => {
		const rendererFiles: string[] = collectSourceFiles("src/renderer/src");
		const violations: string[] = [];

		for (const filePath of rendererFiles) {
			const source: string = readFileSync(filePath, "utf8");
			if (/from\s+["']electron["']|require\(\s*["']electron["']/.test(source)) {
				violations.push(relative(repositoryRoot, filePath));
			}
			if (/from\s+["']node:|require\(\s*["']node:|\bprocess\.\w+|\bglobalThis\.require\b/.test(source)) {
				violations.push(`${relative(repositoryRoot, filePath)}:node-runtime`);
			}
			if (/\beval\s*\(|new\s+Function\s*\(|\brequire\s*\(/.test(source)) {
				violations.push(`${relative(repositoryRoot, filePath)}:dynamic-code`);
			}
		}

		expect(violations).toEqual([]);
	});

	it("preload 暴露单一、显式的 electronAPI 桥接", () => {
		const preloadSource: string = readSource("src/preload/index.ts");

		expect(preloadSource).toContain("contextBridge.exposeInMainWorld(\"electronAPI\"");
		expect(preloadSource).not.toMatch(/contextBridge\.exposeInMainWorld\(\s*["']require["']/);
	});

	it("本地文件访问保留 workspace 根目录校验", () => {
		const workspaceFsSource: string = readSource("src/main/services/workspace-fs.ts");

		expect(workspaceFsSource).toContain("assertInsideWorkspace");
		expect(workspaceFsSource).toMatch(/realpath|realpathSync/);
	});

	it("嵌入式浏览器视图继续使用独立的安全 WebContents 配置", () => {
		const browserSource: string = readSource("src/main/services/browser/browser-service.ts");

		expect(browserSource).toMatch(/sandbox\s*:\s*true/);
		expect(browserSource).toMatch(/contextIsolation\s*:\s*true/);
		expect(browserSource).toMatch(/nodeIntegration\s*:\s*false/);
		expect(browserSource).toMatch(/webSecurity\s*:\s*true/);
	});

	it("移动入口不直接依赖 Electron，Service Worker 不缓存业务接口", () => {
		const remoteFiles: string[] = collectSourceFiles("src/renderer/src/remote");
		const remoteSource: string = remoteFiles.map((filePath: string): string => readFileSync(filePath, "utf8")).join("\n");
		const serviceWorkerSource: string = readSource("src/renderer/public/remote-sw.js");

		expect(remoteSource).not.toContain("electronAPI");
		expect(remoteSource).not.toContain("desktopPlatformRuntime");
		expect(remoteSource).toContain("remotePlatformRuntime");
		expect(serviceWorkerSource).toContain('url.pathname.startsWith("/api/")');
		expect(serviceWorkerSource).not.toMatch(/cache\.put\([^\n]*\/api\//u);
	});
});
