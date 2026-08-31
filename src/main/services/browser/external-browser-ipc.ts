import {
	app,
	ipcMain,
	powerMonitor,
	shell,
	type BrowserWindow,
	type IpcMainInvokeEvent,
} from "electron";
import { basename, dirname, join } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	browserId,
	browserObject,
	parseBrowserScope,
	type ExternalBrowserRequest,
	type ExternalBrowserScope,
	type ExternalBrowserState,
} from "../../../contracts/external-browser";
import { ExternalBrowserService } from "./external-browser-service";
import { assertComputerSender } from "../computer-observation/sender-guard";
const run = promisify(execFile);
export function registerExternalBrowserIpc(
	getMain: () => BrowserWindow | null,
	getSettings: () => BrowserWindow | null,
): void {
	const appPath = app.getAppPath(),
		root =
			basename(appPath) === "main" && basename(dirname(appPath)) === "out"
				? dirname(dirname(appPath))
				: appPath;
	const directory = app.isPackaged
			? join(process.resourcesPath, "browser-host")
			: join(root, "build/browser-host"),
		channel = app.isPackaged ? "stable" : "development";
	const extension = app.isPackaged
		? join(process.resourcesPath, "browser-extension/stable")
		: join(root, "build/browser-extension/development");
	const preferences = join(app.getPath("userData"), "external-browser.json");
	function send(
		window: BrowserWindow | null,
		event: string,
		value: unknown,
	): void {
		if (!window || window.isDestroyed() || window.webContents.isDestroyed())
			return;
		try {
			window.webContents.send(event, value);
		} catch {
			/* 窗口关闭竞争不能阻断撤销 */
		}
	}
	const service = new ExternalBrowserService(
		directory,
		channel,
		(state: ExternalBrowserState) => {
			send(getMain(), "external-browser:state", state);
			send(getSettings(), "external-browser:state", { ...state, active: null });
		},
		(scope: ExternalBrowserScope) =>
			send(getMain(), "external-browser:revoked", scope),
	);
	const watched = new WeakSet<Electron.WebContents>();
	const guard = (event: IpcMainInvokeEvent, settings = false): void => {
		assertComputerSender(event, getMain(), settings ? getSettings() : null);
		if (event.sender === getMain()?.webContents && !watched.has(event.sender)) {
			watched.add(event.sender);
			event.sender.on("destroyed", () => service.stop());
			event.sender.on("render-process-gone", () => service.stop());
			event.sender.on(
				"did-start-navigation",
				(_e, _url, inPlace, mainFrame) => {
					if (mainFrame && !inPlace) service.stop();
				},
			);
		}
	};
	const handle = (
		method: string,
		fn: (value: unknown, event: IpcMainInvokeEvent) => unknown,
		settings = false,
	): void => {
		ipcMain.handle(`external-browser:${method}`, (event, value) => {
			guard(event, settings);
			return fn(value, event);
		});
	};
	handle(
		"getState",
		(_value, event) => ({
			...service.state(),
			...(event.sender === getSettings()?.webContents ? { active: null } : {}),
		}),
		true,
	);
	let configuration = Promise.resolve();
	handle(
		"configure",
		(value) => {
			const row = browserObject(value);
			if (
				Object.keys(row).some(
					(k) => !["enabled", "defaultConnectionId"].includes(k),
				) ||
				(row.enabled !== undefined && typeof row.enabled !== "boolean")
			)
				throw new Error("browser_settings_invalid");
			const patch = {
				...(row.enabled !== undefined
					? { enabled: row.enabled as boolean }
					: {}),
				...(row.defaultConnectionId !== undefined
					? {
							defaultConnectionId:
								row.defaultConnectionId === null
									? null
									: browserId(row.defaultConnectionId),
						}
					: {}),
			};
			const next = configuration.then(async () => {
				const state = await service.configure(patch);
				await mkdir(dirname(preferences), { recursive: true });
				await writeFile(
					`${preferences}.tmp`,
					JSON.stringify({
						enabled: state.enabled,
						defaultConnectionId: state.defaultConnectionId,
					}) + "\n",
				);
				await rename(`${preferences}.tmp`, preferences);
				return state;
			});
			configuration = next.then(
				() => {},
				() => {},
			);
			return next;
		},
		true,
	);
	handle(
		"install",
		async () => {
			const manifest = JSON.parse(
				await readFile(join(extension, "manifest.json"), "utf8"),
			);
			if (!manifest.key) throw new Error("browser_extension_missing");
			const id =
				channel === "stable"
					? "mmmfhlmnfnlknpghpmbimafedcpgpbfh"
					: "nogbahgjfkhmeelmjgkgdefilhobconm";
			const name = `com.daedalus.browser.${channel}`,
				path = join(app.getPath("userData"), `${name}.json`);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(
				path,
				JSON.stringify(
					{
						name,
						description: "Daedalus browser message relay",
						path: join(directory, `daedalus-browser-${channel}.exe`),
						type: "stdio",
						allowed_origins: [`chrome-extension://${id}/`],
					},
					null,
					2,
				),
			);
			for (const browser of ["Google\\Chrome", "Microsoft\\Edge"])
				await run(
					"reg.exe",
					[
						"add",
						`HKCU\\Software\\${browser}\\NativeMessagingHosts\\${name}`,
						"/ve",
						"/t",
						"REG_SZ",
						"/d",
						path,
						"/f",
					],
					{ windowsHide: true },
				);
			const error = await shell.openPath(extension);
			if (error) throw new Error("browser_extension_folder_unavailable");
		},
		true,
	);
	handle("setContext", (value) => {
		if (value === null) return service.setContext(null);
		const row = browserObject(value);
		service.setContext({
			connectionId: browserId(row.connectionId),
			sessionId: row.sessionId === null ? null : browserId(row.sessionId),
			workspaceId: row.workspaceId === null ? null : browserId(row.workspaceId),
		});
	});
	handle("execute", (value) => {
		const row = browserObject(value);
		if (Buffer.byteLength(JSON.stringify(row), "utf8") > 256 * 1024)
			throw new Error("browser_request_too_large");
		return service.execute(row as ExternalBrowserRequest);
	});
	handle("heartbeat", (value) => service.heartbeat(parseBrowserScope(value)));
	handle("finish", (value) => {
		const row = browserObject(value);
		return service.finish(
			parseBrowserScope(row.scope),
			row.keepTarget === true,
		);
	});
	handle("stop", () => service.stop(), true);
	let disposed = false;
	app.on("before-quit", () => {
		disposed = true;
		service.dispose();
	});
	void app
		.whenReady()
		.then(async () => {
			if (
				disposed ||
				process.platform !== "win32" ||
				process.arch !== "x64" ||
				process.argv.includes("--scheduled-task-runner")
			)
				return;
			powerMonitor.on("lock-screen", () => service.stop());
			powerMonitor.on("suspend", () => service.stop());
			const saved = await readFile(preferences, "utf8")
				.then(JSON.parse)
				.catch(() => ({}));
			if (!disposed && saved.enabled === true)
				await service.configure({
					enabled: true,
					defaultConnectionId:
						typeof saved.defaultConnectionId === "string"
							? saved.defaultConnectionId
							: null,
				});
		})
		.catch(() => {
			/* 状态页展示不可用；启动失败不能弹主进程异常框 */
		});
}
