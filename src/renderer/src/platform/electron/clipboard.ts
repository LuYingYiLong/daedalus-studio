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
		if (window.electronAPI?.clipboard?.writeText !== undefined) {
			await window.electronAPI.clipboard.writeText(text);
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

	if (window.electronAPI?.clipboard?.readText !== undefined) {
		const result: { text: string } = await window.electronAPI.clipboard.readText();
		return result.text;
	}

	throw new Error("Clipboard text cannot be read in this environment.");
}
