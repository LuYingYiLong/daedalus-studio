import { clipboard, ipcMain } from "electron";

export type ClipboardWriteTextResult = {
	written: true;
};

export type ClipboardReadTextResult = {
	text: string;
};

export type ClipboardReadImageResult = {
	dataUrl: string | null;
};

const MAX_CLIPBOARD_IMAGE_BYTES: number = 20 * 1024 * 1024;

export function registerClipboardIpc(): void {
	ipcMain.handle("clipboard:write-text", async (_event, text: unknown): Promise<ClipboardWriteTextResult> => {
		if (typeof text !== "string") {
			throw new Error("Clipboard text must be a string.");
		}

		clipboard.writeText(text);
		return { written: true };
	});

	ipcMain.handle("clipboard:read-text", async (): Promise<ClipboardReadTextResult> => {
		return { text: clipboard.readText() };
	});

	ipcMain.handle("clipboard:read-image", async (): Promise<ClipboardReadImageResult> => {
		const image = clipboard.readImage();
		if (image.isEmpty()) {
			return { dataUrl: null };
		}

		const png: Buffer = image.toPNG();
		if (png.byteLength > MAX_CLIPBOARD_IMAGE_BYTES) {
			throw new Error("Clipboard image exceeds the 20 MiB limit.");
		}

		return { dataUrl: `data:image/png;base64,${png.toString("base64")}` };
	});
}
