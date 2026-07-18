import { clipboard, ipcMain } from "electron";

export type ClipboardWriteTextResult = {
	written: true;
};

export function registerClipboardIpc(): void {
	ipcMain.handle("clipboard:write-text", async (_event, text: unknown): Promise<ClipboardWriteTextResult> => {
		if (typeof text !== "string") {
			throw new Error("Clipboard text must be a string.");
		}

		clipboard.writeText(text);
		return { written: true };
	});
}
