import { randomUUID } from "node:crypto";
import type {
	WindowCaptureSource,
	WindowScreenshot,
} from "../../../contracts/window-capture";

export interface CaptureImage {
	isEmpty(): boolean;
	getSize(): { width: number; height: number };
	resize(options: {
		width: number;
		height: number;
		quality: "best";
	}): CaptureImage;
	toPNG(): Buffer;
}

export type CaptureSource = {
	id: string;
	name: string;
	thumbnail: CaptureImage;
	appIcon?: CaptureImage | null;
};
export type WindowCaptureAdapter = {
	getSources(options: {
		types: ["window"];
		thumbnailSize: { width: number; height: number };
		fetchWindowIcons: boolean;
	}): Promise<CaptureSource[]>;
	getOwnSourceIds(): string[];
};
type Picker = { id: string; sources: Map<string, string> };

export function encodeCaptureImage(
	image: CaptureImage,
	maxEdge: number,
	maxBytes: number,
): {
	dataUrl: string;
	width: number;
	height: number;
	byteSize: number;
} {
	let current = image;
	for (let attempt = 0; attempt < 24; attempt += 1) {
		const { width, height } = current.getSize();
		if (current.isEmpty() || width < 1 || height < 1)
			throw new Error("window_capture_empty");
		const scale = Math.min(1, maxEdge / Math.max(width, height));
		if (scale < 1) {
			current = current.resize({
				width: Math.max(1, Math.floor(width * scale)),
				height: Math.max(1, Math.floor(height * scale)),
				quality: "best",
			});
			continue;
		}
		const bytes = current.toPNG();
		if (bytes.length === 0) throw new Error("window_capture_empty");
		if (bytes.length <= maxBytes)
			return {
				dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
				width,
				height,
				byteSize: bytes.length,
			};
		if (width === 1 && height === 1) break;
		const shrink = Math.min(0.8, Math.sqrt(maxBytes / bytes.length) * 0.9);
		current = current.resize({
			width: Math.max(1, Math.floor(width * shrink)),
			height: Math.max(1, Math.floor(height * shrink)),
			quality: "best",
		});
	}
	throw new Error("window_capture_too_large");
}

export class WindowCaptureService {
	private picker: Picker | null = null;
	private tail: Promise<unknown> = Promise.resolve();
	constructor(
		private readonly adapter: WindowCaptureAdapter,
		private readonly timeoutMs = 15_000,
	) {}

	release(pickerId?: string): void {
		if (pickerId === undefined || this.picker?.id === pickerId)
			this.picker = null;
	}

	list(pickerId: string): Promise<{ sources: WindowCaptureSource[] }> {
		const picker: Picker = { id: pickerId, sources: new Map() };
		this.picker = picker;
		return this.run(picker, async () => {
			const sources = await this.adapter.getSources({
				types: ["window"],
				thumbnailSize: { width: 320, height: 180 },
				fetchWindowIcons: true,
			});
			this.assertCurrent(picker);
			const ownIds = new Set(this.adapter.getOwnSourceIds());
			const result: WindowCaptureSource[] = [];
			for (const source of sources) {
				if (
					!source.id.startsWith("window:") ||
					source.id.endsWith(":1") ||
					ownIds.has(source.id)
				)
					continue;
				const sourceId = randomUUID();
				picker.sources.set(sourceId, source.id);
				let thumbnailDataUrl = "";
				let appIconDataUrl: string | undefined;
				try {
					thumbnailDataUrl = encodeCaptureImage(
						source.thumbnail,
						320,
						256 * 1024,
					).dataUrl;
				} catch {
					/* 空预览允许恢复窗口后重新截图 */
				}
				try {
					if (source.appIcon)
						appIconDataUrl = encodeCaptureImage(
							source.appIcon,
							64,
							32 * 1024,
						).dataUrl;
				} catch {
					/* 图标可选 */
				}
				result.push({
					sourceId,
					title: source.name,
					thumbnailDataUrl,
					appIconDataUrl,
				});
			}
			return { sources: result };
		});
	}

	capture(pickerId: string, sourceId: string): Promise<WindowScreenshot> {
		const picker = this.picker;
		const nativeId =
			picker?.id === pickerId ? picker.sources.get(sourceId) : undefined;
		if (!picker || !nativeId)
			return Promise.reject(new Error("window_capture_source_expired"));
		return this.run(picker, async () => {
			const sources = await this.adapter.getSources({
				types: ["window"],
				thumbnailSize: { width: 2560, height: 2560 },
				fetchWindowIcons: false,
			});
			this.assertCurrent(picker);
			const source = sources.find((item) => item.id === nativeId);
			if (!source || this.adapter.getOwnSourceIds().includes(nativeId))
				throw new Error("window_capture_window_closed");
			const png = encodeCaptureImage(source.thumbnail, 2560, 5 * 1024 * 1024);
			return {
				...png,
				mimeType: "image/png",
				sourceId,
				capturedAt: new Date().toISOString(),
			};
		});
	}

	private assertCurrent(picker: Picker): void {
		if (this.picker !== picker)
			throw new Error("window_capture_source_expired");
	}

	private run<T>(picker: Picker, operation: () => Promise<T>): Promise<T> {
		const task = this.tail.then(async () => {
			this.assertCurrent(picker);
			return operation();
		});
		// 超时只取消调用方等待；原生调用结束前不能启动下一次枚举。
		this.tail = task.then(
			() => undefined,
			() => undefined,
		);
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				if (this.picker === picker) this.release();
				reject(new Error("window_capture_timeout"));
			}, this.timeoutMs);
			task
				.then(resolve, (error: unknown) => {
					const code =
						error instanceof Error &&
						/^window_capture_[a-z_]+$/.test(error.message)
							? error.message
							: "window_capture_failed";
					reject(new Error(code));
				})
				.finally(() => clearTimeout(timer));
		});
	}
}
