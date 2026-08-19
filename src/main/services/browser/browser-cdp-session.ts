import type { WebContents } from "electron";

type MessageListener = (method: string, params: Record<string, unknown>) => void;

export class BrowserCdpSession {
	private readonly leases: Set<string> = new Set();
	private readonly messageListeners: Set<MessageListener> = new Set();
	private disposed: boolean = false;

	constructor(private readonly webContents: WebContents) {
		this.webContents.debugger.on("message", (_event, method: string, params: Record<string, unknown>): void => {
			for (const listener of this.messageListeners) listener(method, params);
		});
		this.webContents.debugger.on("detach", (): void => {
			this.leases.clear();
		});
	}

	async acquire(owner: string): Promise<() => void> {
		if (this.disposed || this.webContents.isDestroyed()) throw new Error("browser_cdp_unavailable");
		if (!this.webContents.debugger.isAttached()) this.webContents.debugger.attach("1.3");
		this.leases.add(owner);
		let released: boolean = false;
		return (): void => {
			if (released) return;
			released = true;
			this.release(owner);
		};
	}

	async sendCommand<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
		if (!this.webContents.debugger.isAttached()) throw new Error("browser_cdp_unavailable");
		return await this.webContents.debugger.sendCommand(method, params) as T;
	}

	onMessage(listener: MessageListener): () => void {
		this.messageListeners.add(listener);
		return (): void => { this.messageListeners.delete(listener); };
	}

	dispose(): void {
		this.disposed = true;
		this.leases.clear();
		this.messageListeners.clear();
		if (this.webContents.debugger.isAttached()) {
			try { this.webContents.debugger.detach(); } catch { /* web contents already closed */ }
		}
	}

	private release(owner: string): void {
		this.leases.delete(owner);
		if (this.leases.size === 0 && this.webContents.debugger.isAttached()) {
			try { this.webContents.debugger.detach(); } catch { /* web contents already closed */ }
		}
	}
}
