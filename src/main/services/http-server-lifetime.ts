import type { Server } from "node:http";
import type { Socket } from "node:net";

/** 同时跟踪普通、TLS 握手中和已升级的连接，不能只依赖 closeAllConnections */
export class HttpServerLifetime {
	private readonly sockets = new Set<Socket>();
	private closing = false;
	private closePromise: Promise<void> | null = null;

	public constructor(private readonly server: Server, private readonly graceMs: number = 1_500) {
		server.on("connection", (socket: Socket): void => {
			if (this.closing) { socket.destroy(); return; }
			this.sockets.add(socket);
			socket.once("close", (): void => { this.sockets.delete(socket); });
		});
		// stop 可能先于 listen 完成，迟到的监听也不能重新开放端口
		server.on("listening", (): void => {
			if (this.closing) { server.close(); this.forceClose(); }
		});
	}

	public forceClose(): void {
		this.closing = true;
		this.server.closeAllConnections();
		for (const socket of this.sockets) socket.destroy();
		this.sockets.clear();
	}

	public close(): Promise<void> {
		if (this.closePromise !== null) return this.closePromise;
		this.closing = true;
		this.closePromise = new Promise<void>((resolve): void => {
			const timer = setTimeout((): void => { this.forceClose(); resolve(); }, this.graceMs);
			try {
				this.server.close((): void => { clearTimeout(timer); resolve(); });
			} catch {
				clearTimeout(timer);
				this.forceClose();
				resolve();
			}
		});
		return this.closePromise;
	}
}
