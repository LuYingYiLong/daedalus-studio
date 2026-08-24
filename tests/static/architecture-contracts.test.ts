import { readdirSync, readFileSync, statSync } from "node:fs";
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
});
