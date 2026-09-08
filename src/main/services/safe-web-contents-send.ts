import type { WebContents } from "electron";

/**
 * Renderer reload/crash 与主进程定时事件可能同时发生；send 前的 destroyed
 * 检查不是原子操作，因此必须把 mainFrame 访问和 send 一起放进 try/catch。
 */
export function safeSendToWebContents(
	contents: WebContents | null | undefined,
	channel: string,
	...args: unknown[]
): boolean {
	if (contents === null || contents === undefined) return false;
	try {
		if (contents.isDestroyed()) return false;
		const frame = contents.mainFrame as unknown as { isDestroyed?: () => boolean } | null | undefined;
		if (frame?.isDestroyed?.() === true) return false;
		contents.send(channel, ...args);
		return true;
	} catch {
		// Renderer 关闭、崩溃或热重载期间，状态事件可以安全丢弃。
		return false;
	}
}
