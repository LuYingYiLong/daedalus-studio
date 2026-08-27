function writeTextWithDomFallback(text: string): void {
	const textarea: HTMLTextAreaElement = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "true");
	textarea.style.position = "fixed";
	textarea.style.top = "-1000px";
	textarea.style.left = "-1000px";
	textarea.style.opacity = "0";

	document.body.appendChild(textarea);
	textarea.focus();
	textarea.select();

	try {
		const copied: boolean = document.execCommand("copy");
		if (!copied) {
			throw new Error("document.execCommand(\"copy\") returned false.");
		}
	} finally {
		document.body.removeChild(textarea);
	}
}

export async function copyTextToClipboard(text: string): Promise<void> {
	if (text.length === 0) {
		return;
	}

	try {
		if (navigator.clipboard?.writeText !== undefined) {
			await navigator.clipboard.writeText(text);
			return;
		}
	} catch {
		// Electron 的 renderer 权限或安全上下文可能拒绝 navigator.clipboard，继续尝试主进程剪贴板。
	}

	try {
		const clipboard = getPlatformRuntime().system?.clipboard;
		if (clipboard !== undefined) {
			await clipboard.writeText(text);
			return;
		}
	} catch {
		// 主进程剪贴板不可用时使用 DOM fallback。
	}

	writeTextWithDomFallback(text);
}

export async function readTextFromClipboard(): Promise<string> {
	try {
		if (navigator.clipboard?.readText !== undefined) {
			return await navigator.clipboard.readText();
		}
	} catch {
		// Electron renderer 可能没有 Clipboard API 权限，继续尝试主进程剪贴板。
	}

	const clipboard = getPlatformRuntime().system?.clipboard;
	if (clipboard !== undefined) {
		return await clipboard.readText();
	}

	throw new Error("Clipboard text cannot be read in this environment.");
}

function createFileFromDataUrl(dataUrl: string, fileName?: string): File {
	const match: RegExpMatchArray | null = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/iu);
	if (match === null) {
		throw new Error("Clipboard image data is invalid.");
	}

	const mimeType: string = match[1] as string;
	const binary: string = atob(match[2] as string);
	const buffer: ArrayBuffer = new ArrayBuffer(binary.length);
	const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(buffer);
	for (let index: number = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return new File([buffer], fileName?.trim() || `clipboard-image-${Date.now()}.png`, {
		type: mimeType,
		lastModified: Date.now()
	});
}

export async function readImageFromClipboard(): Promise<File | null> {
	const clipboard = getPlatformRuntime().system?.clipboard;
	if (clipboard === undefined) throw new Error("Clipboard images are unavailable in this environment.");
	const result: { dataUrl: string | null; fileName?: string } = await clipboard.readImage();
	return result.dataUrl === null ? null : createFileFromDataUrl(result.dataUrl, result.fileName);
}
import { getPlatformRuntime } from "@/platform/runtime/platform-runtime";
