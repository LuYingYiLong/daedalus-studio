import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	browserPackets,
	BrowserPacketReader,
} from "../../../contracts/browser-wire";
import {
	browserId,
	browserObject,
	type ExternalBrowserScope,
} from "../../../contracts/external-browser";
const FRAME_LIMIT = 768 * 1024;
export class BrowserHostFrames {
	private buffer: Buffer = Buffer.alloc(0);
	push(chunk: Buffer): unknown[] {
		this.buffer = Buffer.concat([this.buffer, chunk]);
		const result: unknown[] = [];
		while (this.buffer.length >= 4) {
			const size = this.buffer.readUInt32LE();
			if (size < 1 || size > FRAME_LIMIT)
				throw new Error("browser_frame_invalid");
			if (this.buffer.length < size + 4) break;
			result.push(
				JSON.parse(this.buffer.subarray(4, size + 4).toString("utf8")),
			);
			this.buffer = this.buffer.subarray(size + 4);
		}
		return result;
	}
}
export type BrowserPeer = { peer: number; id: string; name: string };
type Pending = {
	peer: number;
	resolve(value: Record<string, unknown>): void;
	reject(error: Error): void;
	timer: NodeJS.Timeout;
};
export class BrowserHostClient {
	private child: ChildProcessWithoutNullStreams | null = null;
	private startTask: Promise<void> | null = null;
	private readers = new Map<number, BrowserPacketReader>();
	private pending = new Map<string, Pending>();
	readonly peers = new Map<number, BrowserPeer>();
	constructor(
		readonly directory: string,
		readonly channel: "stable" | "development",
		private readonly changed: () => void,
		private readonly revoked: (scope: unknown) => void,
	) {}
	async start(): Promise<void> {
		if (this.startTask) return this.startTask;
		this.startTask = this.launch().catch((error) => {
			this.stop();
			throw error;
		});
		return this.startTask;
	}
	private async launch(): Promise<void> {
		const name = `daedalus-browser-${this.channel}.exe`,
			file = join(this.directory, name);
		const manifest = JSON.parse(
			await readFile(join(this.directory, "manifest.json"), "utf8"),
		);
		const bytes = await readFile(file);
		if (
			manifest.protocolVersion !== 1 ||
			manifest.files?.[name]?.sha256 !==
				createHash("sha256").update(bytes).digest("hex")
		)
			throw new Error("browser_host_integrity_failed");
		const child = spawn(file, ["--broker"], {
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		this.child = child;
		const frames = new BrowserHostFrames();
		child.stderr.resume();
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error("browser_host_start_timeout")),
				5000,
			);
			const failed = (): void => {
				clearTimeout(timeout);
				reject(new Error("browser_host_disconnected"));
				if (this.child === child) this.stop();
			};
			child.once("error", failed);
			child.once("exit", failed);
			child.stdin.on("error", failed);
			child.stdout.on("error", failed);
			child.stdout.on("data", (chunk: Buffer) => {
				try {
					for (const value of frames.push(chunk)) {
						const row = browserObject(value);
						if (row.ready === true) {
							clearTimeout(timeout);
							resolve();
						} else this.receive(row);
					}
				} catch {
					failed();
				}
			});
		});
	}
	private write(value: unknown): void {
		if (!this.child || this.child.stdin.destroyed)
			throw new Error("browser_host_disconnected");
		const json = Buffer.from(JSON.stringify(value));
		if (json.length > FRAME_LIMIT) throw new Error("browser_frame_too_large");
		if (this.child.stdin.writableLength > 8 * 1024 * 1024)
			throw new Error("browser_host_backpressure");
		const length = Buffer.alloc(4);
		length.writeUInt32LE(json.length);
		this.child.stdin.write(Buffer.concat([length, json]));
	}
	private receive(row: Record<string, unknown>): void {
		const peer = Number(row.peer);
		if (!Number.isSafeInteger(peer) || peer < 1)
			throw new Error("browser_peer_invalid");
		if (row.closed) {
			this.readers.delete(peer);
			this.peers.delete(peer);
			this.rejectPeer(peer);
			this.changed();
			return;
		}
		let reader = this.readers.get(peer);
		if (!reader) {
			if (this.readers.size >= 8) throw new Error("browser_connection_limit");
			reader = new BrowserPacketReader();
			this.readers.set(peer, reader);
		}
		const message = reader.accept(row.packet);
		if (!message) return;
		const data = browserObject(message);
		if (!this.peers.has(peer)) {
			if (
				data.kind !== "hello" ||
				data.version !== 1 ||
				typeof data.name !== "string" ||
				data.name.length > 100
			)
				throw new Error("browser_handshake_invalid");
			const id = browserId(data.id);
			if ([...this.peers.values()].some((p) => p.id === id))
				throw new Error("browser_duplicate_connection");
			this.peers.set(peer, { peer, id, name: data.name });
			for (const packet of browserPackets({
				kind: "hello_ack",
				version: 1,
				id,
			}))
				this.write({ peer, packet });
			this.changed();
			return;
		}
		if (data.kind === "revoked") {
			this.revoked(data.scope);
			return;
		}
		const pending = this.pending.get(browserId(data.id));
		if (!pending || pending.peer !== peer) return;
		this.pending.delete(String(data.id));
		clearTimeout(pending.timer);
		if (data.ok === true) pending.resolve(browserObject(data.result));
		else
			pending.reject(
				new Error(
					typeof data.error === "string" &&
						/^browser_[a-z_]{1,80}$/u.test(data.error)
						? data.error
						: "browser_extension_error",
				),
			);
	}
	request(
		peer: number,
		operation: string,
		args: Record<string, unknown>,
		scope: ExternalBrowserScope,
	): Promise<Record<string, unknown>> {
		if (!this.peers.has(peer) || this.pending.size >= 32)
			return Promise.reject(new Error("browser_connection_unavailable"));
		const id = randomUUID();
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error("browser_extension_timeout"));
			}, 20000);
			this.pending.set(id, { peer, resolve, reject, timer });
			try {
				for (const packet of browserPackets({ id, operation, args, scope }))
					this.write({ peer, packet });
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(error);
			}
		});
	}
	private rejectPeer(peer: number): void {
		for (const [id, pending] of this.pending)
			if (pending.peer === peer) {
				clearTimeout(pending.timer);
				pending.reject(new Error("browser_host_disconnected"));
				this.pending.delete(id);
			}
	}
	stop(): void {
		const child = this.child;
		this.child = null;
		this.startTask = null;
		child?.stdin.end();
		if (child && child.exitCode === null) {
			const deadline = setTimeout(() => {
				if (child.exitCode === null) child.kill();
			}, 1000);
			deadline.unref();
		}
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(new Error("browser_host_disconnected"));
		}
		this.pending.clear();
		this.peers.clear();
		this.readers.clear();
		this.changed();
	}
}
