export interface ReconnectConfig {
	readonly maxAttempts: number;
	readonly initialDelay: number;
	readonly maxDelay: number;
	readonly backoffMultiplier: number;
}

export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
	maxAttempts: 10,
	initialDelay: 1000,
	maxDelay: 30000,
	backoffMultiplier: 2
};

export class ReconnectionManager {
	private attempt: number = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private readonly config: ReconnectConfig;
	private readonly logger: (message: string, context?: Record<string, unknown>) => void;

	constructor(
		config: ReconnectConfig = DEFAULT_RECONNECT_CONFIG,
		logger?: (message: string, context?: Record<string, unknown>) => void
	) {
		this.config = config;
		this.logger = logger ?? ((_: string): void => {});
	}

	scheduleReconnect(callback: () => void): void {
		if (this.timer !== null) {
			clearTimeout(this.timer);
		}

		if (this.attempt >= this.config.maxAttempts) {
			this.logger("重连次数已达上限", { attempt: this.attempt, maxAttempts: this.config.maxAttempts });
			return;
		}

		const delay: number = this.calculateDelay();

		this.logger("调度重连", { attempt: this.attempt + 1, delay });

		this.timer = setTimeout((): void => {
			this.attempt += 1;
			callback();
		}, delay);
	}

	reset(): void {
		if (this.timer !== null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this.attempt = 0;
		this.logger("重连策略已重置");
	}

	private calculateDelay(): number {
		const baseDelay: number = this.config.initialDelay;
		const exponentialDelay: number = baseDelay * Math.pow(this.config.backoffMultiplier, this.attempt);
		const jitter: number = exponentialDelay * 0.1 * Math.random();

		return Math.min(exponentialDelay + jitter, this.config.maxDelay);
	}

	getAttempt(): number {
		return this.attempt;
	}

	isExhausted(): boolean {
		return this.attempt >= this.config.maxAttempts;
	}

	destroy(): void {
		this.reset();
	}
}
