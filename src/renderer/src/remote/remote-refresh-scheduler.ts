export class RemoteRefreshScheduler {
	private pendingSessionId: string | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private refreshInFlight: boolean = false;
	private lastRefreshStartedAt: number | null = null;

	public constructor(
		private readonly refresh: (sessionId: string) => Promise<void>,
		private readonly intervalMs: number,
		private readonly now: () => number = Date.now,
	) {}

	public schedule(sessionId: string): void {
		this.pendingSessionId = sessionId;
		this.armTimer();
	}

	public dispose(): void {
		this.pendingSessionId = null;
		if (this.timer !== null) clearTimeout(this.timer);
		this.timer = null;
	}

	private armTimer(): void {
		if (this.pendingSessionId === null
			|| this.timer !== null
			|| this.refreshInFlight) return;
		const elapsed: number = this.lastRefreshStartedAt === null
			? this.intervalMs
			: this.now() - this.lastRefreshStartedAt;
		const delay: number = Math.max(0, this.intervalMs - elapsed);
		this.timer = setTimeout((): void => {
			this.timer = null;
			void this.runRefresh();
		}, delay);
	}

	private async runRefresh(): Promise<void> {
		const sessionId: string | null = this.pendingSessionId;
		if (sessionId === null) return;
		this.pendingSessionId = null;
		this.refreshInFlight = true;
		this.lastRefreshStartedAt = this.now();
		try {
			await this.refresh(sessionId);
		} finally {
			this.refreshInFlight = false;
			this.armTimer();
		}
	}
}
