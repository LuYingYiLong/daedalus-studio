import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_TEXT_BYTES: number = 32 * 1024 * 1024;

export type SaveTextFileParams = {
	defaultFileName: string;
	content: string;
};

export type SaveTextFileResult =
	| { saved: true; filePath: string }
	| { saved: false };

function normalizeFileName(value: unknown): string {
	const rawName: string = typeof value === "string" ? value.trim() : "";
	const safeName: string = rawName
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
		.replace(/[. ]+$/g, "")
		.slice(0, 120);
	return safeName.length > 0 ? safeName : "snippet.txt";
}

export function registerFileExportIpc(): void {
	ipcMain.handle("file-export:save-text", async (event, params: unknown): Promise<SaveTextFileResult> => {
		const owner: BrowserWindow | null = BrowserWindow.fromWebContents(event.sender);
		if (owner === null || owner.isDestroyed()) {
			throw new Error("file_export_not_allowed");
		}
		if (typeof params !== "object" || params === null || Array.isArray(params)) {
			throw new Error("file_export_params_invalid");
		}

		const record: Record<string, unknown> = params as Record<string, unknown>;
		const content: unknown = record.content;
		if (typeof content !== "string") {
			throw new Error("file_export_content_invalid");
		}
		const contentBytes: number = Buffer.byteLength(content, "utf8");
		if (contentBytes > MAX_TEXT_BYTES) {
			throw new Error("file_export_content_too_large");
		}

		const result: Electron.SaveDialogReturnValue = await dialog.showSaveDialog(owner, {
			title: "Export code as file",
			defaultPath: join(app.getPath("documents"), normalizeFileName(record.defaultFileName)),
			buttonLabel: "Export",
			properties: ["createDirectory", "showOverwriteConfirmation"]
		});
		if (result.canceled || typeof result.filePath !== "string" || result.filePath.length === 0) {
			return { saved: false };
		}

		await writeFile(result.filePath, content, "utf8");
		return { saved: true, filePath: result.filePath };
	});
}
