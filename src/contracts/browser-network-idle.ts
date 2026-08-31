// 只保留请求 ID 和时序，不保存 URL、Header、Cookie 或网络正文
export class BrowserNetworkIdle {
	private readonly pending = new Set<string>();
	private changedAt: number;
	private overflow = false;
	constructor(private readonly now = Date.now) {
		this.changedAt = now();
	}
	accept(method: string, requestId: unknown): void {
		if (
			![
				"Network.requestWillBeSent",
				"Network.loadingFinished",
				"Network.loadingFailed",
			].includes(method)
		)
			return;
		if (typeof requestId !== "string" || requestId.length > 128) {
			this.overflow = true;
			return;
		}
		this.changedAt = this.now();
		if (method === "Network.requestWillBeSent") {
			if (this.pending.size >= 1024 && !this.pending.has(requestId))
				this.overflow = true;
			else this.pending.add(requestId);
		} else this.pending.delete(requestId);
	}
	isIdle(): boolean {
		return (
			!this.overflow &&
			this.pending.size === 0 &&
			this.now() - this.changedAt >= 500
		);
	}
}
