import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_PNG_BYTES: number = 64 * 1024 * 1024;
const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type SavePngImageParams = {
	defaultFileName: string;
	bytes: Uint8Array;
};

export type SavePngImageResult =
	| { saved: true; filePath: string }
	| { saved: false };

function normalizePngFileName(value: unknown): string {
	const rawName: string = typeof value === "string" ? value.trim() : "";
	const safeName: string = rawName
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
		.replace(/[. ]+$/g, "")
		.slice(0, 120);
	const fileName: string = safeName.length > 0 ? safeName : "mermaid-diagram";
	return fileName.toLowerCase().endsWith(".png") ? fileName : `${fileName}.png`;
}

function normalizePngBytes(value: unknown): Uint8Array {
	let bytes: Uint8Array;
	if (value instanceof Uint8Array) {
		bytes = value;
	} else if (value instanceof ArrayBuffer) {
		bytes = new Uint8Array(value);
	} else {
		throw new Error("image_export_bytes_invalid");
	}

	if (bytes.byteLength < PNG_SIGNATURE.length || bytes.byteLength > MAX_PNG_BYTES) {
		throw new Error("image_export_png_size_invalid");
	}
	if (!PNG_SIGNATURE.every((byte: number, index: number): boolean => bytes[index] === byte)) {
		throw new Error("image_export_png_signature_invalid");
	}
	return bytes;
}

export function registerImageExportIpc(): void {
	ipcMain.handle("image-export:save-png", async (event, params: unknown): Promise<SavePngImageResult> => {
		const owner: BrowserWindow | null = BrowserWindow.fromWebContents(event.sender);
		if (owner === null || owner.isDestroyed()) {
			throw new Error("image_export_not_allowed");
		}
		if (typeof params !== "object" || params === null || Array.isArray(params)) {
			throw new Error("image_export_params_invalid");
		}

		const record: Record<string, unknown> = params as Record<string, unknown>;
		const fileName: string = normalizePngFileName(record.defaultFileName);
		const bytes: Uint8Array = normalizePngBytes(record.bytes);
		const result: Electron.SaveDialogReturnValue = await dialog.showSaveDialog(owner, {
			title: "Export Mermaid diagram",
			defaultPath: join(app.getPath("pictures"), fileName),
			buttonLabel: "Export",
			filters: [{ name: "PNG image", extensions: ["png"] }],
			properties: ["createDirectory", "showOverwriteConfirmation"]
		});
		if (result.canceled || typeof result.filePath !== "string" || result.filePath.length === 0) {
			return { saved: false };
		}

		await writeFile(result.filePath, bytes);
		return { saved: true, filePath: result.filePath };
	});
}
