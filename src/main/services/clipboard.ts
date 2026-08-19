import { clipboard, ipcMain } from "electron";
import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export type ClipboardWriteTextResult = {
	written: true;
};

export type ClipboardReadTextResult = {
	text: string;
};

export type ClipboardReadImageResult = {
	dataUrl: string | null;
	fileName?: string | undefined;
};

const MAX_CLIPBOARD_IMAGE_BYTES: number = 20 * 1024 * 1024;

function detectSupportedImageMimeType(bytes: Buffer): string | null {
	if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
		return "image/png";
	}
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return "image/jpeg";
	}
	if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
		return "image/webp";
	}
	if (bytes.length >= 6) {
		const signature: string = bytes.toString("ascii", 0, 6);
		if (signature === "GIF87a" || signature === "GIF89a") {
			return "image/gif";
		}
	}
	return null;
}

export function parseClipboardFileUriList(uriList: string): string[] {
	const paths: string[] = [];
	for (const line of uriList.split(/\r?\n/u)) {
		const value: string = line.trim();
		if (value.length === 0 || value.startsWith("#")) {
			continue;
		}
		try {
			const url: URL = new URL(value);
			if (url.protocol === "file:") {
				paths.push(fileURLToPath(url));
			}
		} catch {
			// Ignore malformed or non-file clipboard entries.
		}
	}
	return paths.slice(0, 20);
}

function parseClipboardNativeFileList(value: string): string[] {
	return value
		.split(/\0|\r?\n/u)
		.map((entry: string): string => entry.trim())
		.filter((entry: string): boolean => entry.length > 0 && isAbsolute(entry))
		.slice(0, 20);
}

function readCopiedFilePaths(): string[] {
	const formats: string[] = clipboard.availableFormats();
	const uriListFormat: string | undefined = formats.find((format: string): boolean => format.toLowerCase() === "text/uri-list");
	if (uriListFormat !== undefined) {
		const paths: string[] = parseClipboardFileUriList(clipboard.read(uriListFormat));
		if (paths.length > 0) {
			return paths;
		}
	}

	const wideFileNameFormat: string | undefined = formats.find((format: string): boolean => format.toLowerCase() === "filenamew");
	if (wideFileNameFormat !== undefined) {
		const paths: string[] = parseClipboardNativeFileList(clipboard.readBuffer(wideFileNameFormat).toString("utf16le"));
		if (paths.length > 0) {
			return paths;
		}
	}

	const fileNameFormat: string | undefined = formats.find((format: string): boolean => format.toLowerCase() === "filename");
	return fileNameFormat === undefined
		? []
		: parseClipboardNativeFileList(clipboard.readBuffer(fileNameFormat).toString());
}

async function readCopiedImageFile(): Promise<ClipboardReadImageResult | null> {
	for (const filePath of readCopiedFilePaths()) {
		try {
			const fileStat = await stat(filePath);
			if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > MAX_CLIPBOARD_IMAGE_BYTES) {
				continue;
			}
			const bytes: Buffer = await readFile(filePath);
			const mimeType: string | null = detectSupportedImageMimeType(bytes);
			if (mimeType === null) {
				continue;
			}
			return {
				dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
				fileName: basename(filePath)
			};
		} catch {
			// The copied file can disappear or become inaccessible before paste.
		}
	}
	return null;
}

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
			return await readCopiedImageFile() ?? { dataUrl: null };
		}

		const png: Buffer = image.toPNG();
		if (png.byteLength > MAX_CLIPBOARD_IMAGE_BYTES) {
			throw new Error("Clipboard image exceeds the 20 MiB limit.");
		}

		return { dataUrl: `data:image/png;base64,${png.toString("base64")}` };
	});
}
