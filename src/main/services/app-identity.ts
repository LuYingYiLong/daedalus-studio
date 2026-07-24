import { app, nativeImage } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const APP_NAME = "Daedalus Studio";
export const APP_ID = "com.daedalus.studio";

export function configureAppIdentity(): void {
	app.setName(APP_NAME);
	if (process.platform === "win32") {
		app.setAppUserModelId(APP_ID);
	}
}

export function getAppIconPath(): string | null {
	const iconPath: string = app.isPackaged
		? join(process.resourcesPath, "icon.ico")
		: join(app.getAppPath(), "build/icon.ico");

	return existsSync(iconPath) ? iconPath : null;
}

export function getAppIconImage(): Electron.NativeImage | null {
	const iconPath: string | null = getAppIconPath();
	if (iconPath === null) {
		return null;
	}

	const icon = nativeImage.createFromPath(iconPath);
	return icon.isEmpty() ? null : icon;
}
