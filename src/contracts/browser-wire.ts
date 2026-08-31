// Native Messaging 的单帧限制与完整截图上限分开处理
export const BROWSER_WIRE_LIMIT = 4 * 1024 * 1024;
export type BrowserPacket = {
	wire: 1;
	id: string;
	index: number;
	count: number;
	text: string;
};
export function browserPackets(
	value: unknown,
	id = crypto.randomUUID(),
): BrowserPacket[] {
	const text = JSON.stringify(value);
	if (new TextEncoder().encode(text).length > BROWSER_WIRE_LIMIT)
		throw new Error("browser_message_too_large");
	const count = Math.max(1, Math.ceil(text.length / 131072));
	return Array.from({ length: count }, (_, index) => ({
		wire: 1,
		id,
		index,
		count,
		text: text.slice(index * 131072, (index + 1) * 131072),
	}));
}
export class BrowserPacketReader {
	private transfers = new Map<
		string,
		{
			pieces: string[];
			count: number;
			next: number;
			bytes: number;
			expires: number;
		}
	>();
	accept(input: unknown, now = Date.now()): unknown | undefined {
		for (const [id, transfer] of this.transfers)
			if (transfer.expires < now) this.transfers.delete(id);
		const p = input as BrowserPacket;
		if (
			!p ||
			Object.keys(p).some(
				(key) => !["wire", "id", "index", "count", "text"].includes(key),
			) ||
			p.wire !== 1 ||
			typeof p.id !== "string" ||
			!/^[a-zA-Z0-9_-]{1,80}$/u.test(p.id) ||
			!Number.isInteger(p.count) ||
			p.count < 1 ||
			p.count > 32 ||
			!Number.isInteger(p.index) ||
			p.index < 0 ||
			p.index >= p.count ||
			typeof p.text !== "string" ||
			p.text.length > 131072
		)
			throw new Error("browser_invalid_packet");
		let transfer = this.transfers.get(p.id);
		if (!transfer) {
			if (p.index !== 0 || this.transfers.size >= 8)
				throw new Error("browser_invalid_transfer");
			transfer = {
				pieces: [],
				count: p.count,
				next: 0,
				bytes: 0,
				expires: now + 10000,
			};
			this.transfers.set(p.id, transfer);
		}
		if (transfer.count !== p.count || transfer.next !== p.index) {
			this.transfers.delete(p.id);
			throw new Error("browser_packet_order");
		}
		transfer.bytes += new TextEncoder().encode(p.text).length;
		if (transfer.bytes > BROWSER_WIRE_LIMIT) {
			this.transfers.delete(p.id);
			throw new Error("browser_message_too_large");
		}
		transfer.pieces.push(p.text);
		transfer.next++;
		if (transfer.next !== transfer.count) return undefined;
		this.transfers.delete(p.id);
		return JSON.parse(transfer.pieces.join(""));
	}
	clear(): void {
		this.transfers.clear();
	}
}
