import type { ChromeApi, NativePort } from "./chrome-api";
import { browserPackets, BrowserPacketReader } from "../contracts/browser-wire";
import { browserId, browserObject } from "../contracts/external-browser";

export type NativeConnectionState = {
	enabled: boolean;
	connected: boolean;
	connecting: boolean;
	error: string | null;
};

function connectionError(message?: string): string {
	if (/not found|not registered/i.test(message || ""))
		return "browser_native_host_missing";
	if (/forbidden|not allowed|access.*denied/i.test(message || ""))
		return "browser_native_host_forbidden";
	return "browser_studio_unavailable";
}

export class NativeConnection {
	private port: NativePort | null = null;
	private enabled = false;
	private connected = false;
	private connecting = false;
	private error: string | null = null;
	private revision = 0;
	private handshakeTimer: ReturnType<typeof setTimeout> | undefined;
	private startup: Promise<void>;
	constructor(
		private readonly api: Pick<ChromeApi, "runtime" | "storage" | "action">,
		private readonly channel: string,
		private readonly name: string,
		private readonly request: (
			message: Record<string, unknown>,
			checkConnection: () => void,
		) => Promise<unknown>,
		private readonly invalidate: () => void,
	) {
		const revision = this.revision;
		this.startup = api.storage.local
			.get("enabled")
			.then((row) => {
				if (revision === this.revision) this.enabled = row.enabled === true;
			})
			.catch(() => {
				this.error = "browser_extension_storage_unavailable";
			});
	}
	state(): NativeConnectionState {
		return {
			enabled: this.enabled,
			connected: this.connected,
			connecting: this.connecting,
			error: this.error,
		};
	}
	async setEnabled(enabled: boolean): Promise<void> {
		this.revision++;
		this.enabled = enabled;
		this.reset(null);
		await this.api.storage.local.set({ enabled });
		await this.connect();
	}
	private badge(text: string): void {
		void this.api.action.setBadgeText({ text }).catch(() => {});
	}
	private reset(error: string | null): void {
		const port = this.port;
		this.port = null;
		this.connected = false;
		this.connecting = false;
		this.error = error;
		clearTimeout(this.handshakeTimer);
		this.handshakeTimer = undefined;
		this.invalidate();
		this.badge(error ? "!" : "");
		try {
			port?.disconnect();
		} catch {
			/* 断开的 Port 无需再次清理 */
		}
	}
	private post(port: NativePort, value: unknown): void {
		for (const packet of browserPackets(value)) port.postMessage(packet);
	}
	send(value: unknown): void {
		if (!this.port || !this.connected) return;
		try {
			this.post(this.port, value);
		} catch {
			this.reset("browser_studio_unavailable");
		}
	}
	async connect(): Promise<void> {
		await this.startup;
		if (!this.enabled || this.port || this.connecting) return;
		this.connecting = true;
		const revision = this.revision;
		let port: NativePort | null = null;
		try {
			const storage = await this.api.storage.local.get("instance");
			const instance =
				typeof storage.instance === "string"
					? browserId(storage.instance)
					: crypto.randomUUID();
			await this.api.storage.local.set({ instance });
			if (revision !== this.revision || !this.enabled) return;
			port = this.api.runtime.connectNative(
				`com.daedalus.browser.${this.channel}`,
			);
			this.port = port;
			const current = port;
			const reader = new BrowserPacketReader();
			const checkConnection = (): void => {
				if (this.port !== current || !this.enabled || !this.connected)
					throw new Error("browser_connection_stale");
			};
			current.onDisconnect.addListener(() => {
				const message = this.api.runtime.lastError?.message;
				if (this.port === current) this.reset(connectionError(message));
			});
			current.onMessage.addListener((packet) => {
				if (this.port !== current) return;
				try {
					const row = reader.accept(packet);
					if (!row) return;
					const message = browserObject(row);
					if (!this.connected) {
						if (
							message.kind !== "hello_ack" ||
							message.version !== 1 ||
							message.id !== instance
						)
							throw new Error("browser_handshake_invalid");
						clearTimeout(this.handshakeTimer);
						this.connected = true;
						this.connecting = false;
						this.error = null;
						this.badge("ON");
						return;
					}
					const id = browserId(message.id);
					void this.request(message, checkConnection).then(
						(result) => {
							if (this.port === current && this.connected)
								this.send({ id, ok: true, result });
						},
						(error: unknown) => {
							if (this.port === current && this.connected)
								this.send({
									id,
									ok: false,
									error:
										error instanceof Error &&
										/^browser_[a-z_]+$/u.test(error.message)
											? error.message
											: "browser_request_failed",
								});
						},
					);
				} catch {
					this.reset("browser_handshake_invalid");
				}
			});
			this.handshakeTimer = setTimeout(() => {
				if (this.port === current && !this.connected)
					this.reset("browser_handshake_timeout");
			}, 5000);
			this.post(current, {
				kind: "hello",
				version: 1,
				id: instance,
				name: this.name,
			});
		} catch (error) {
			if (revision === this.revision && (!port || this.port === port))
				this.reset(
					connectionError(error instanceof Error ? error.message : undefined),
				);
		}
	}
}
