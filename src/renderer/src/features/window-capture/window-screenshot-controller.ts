import type {
	WindowCaptureAPI,
	WindowCaptureSource,
} from "../../../../contracts/window-capture";
import type {
	ImageImport,
	PreparedImage,
} from "../workspace/controllers/image-import";

export type WindowScreenshotState = {
	open: boolean;
	sources: WindowCaptureSource[];
	search: string;
	selectedSourceId: string | null;
	loading: boolean;
	capturing: boolean;
	saving: boolean;
	error: string | null;
};
const initialState = (): WindowScreenshotState => ({
	open: false,
	sources: [],
	search: "",
	selectedSourceId: null,
	loading: false,
	capturing: false,
	saving: false,
	error: null,
});

export function filterWindowSources(
	sources: WindowCaptureSource[],
	search: string,
): WindowCaptureSource[] {
	const query = search.trim().toLocaleLowerCase();
	return sources.filter((source) =>
		source.title.toLocaleLowerCase().includes(query),
	);
}

function errorCode(error: unknown, fallback: string): string {
	const message = error instanceof Error ? error.message : "";
	return (
		message.match(/\b(?:window_capture|image_import)_[a-z_]+\b/)?.[0] ??
		fallback
	);
}

export class WindowScreenshotController {
	private state = initialState();
	private listeners = new Set<() => void>();
	private pickerId: string | null = null;
	private version = 0;
	private scope: number | null = null;
	private importImage: ImageImport | null = null;
	private prepared: { sourceId: string; image: PreparedImage } | null = null;

	constructor(
		private readonly deps: {
			api: WindowCaptureAPI;
			getScope: () => number;
			createImport: () => ImageImport;
			filename: () => string;
		},
	) {}
	getSnapshot = (): WindowScreenshotState => this.state;
	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};
	private update(patch: Partial<WindowScreenshotState>): void {
		this.state = { ...this.state, ...patch };
		this.listeners.forEach((listener) => listener());
	}
	validateScope = (): void => {
		if (this.scope !== null && this.scope !== this.deps.getScope())
			this.close();
	};
	private isCurrent(version: number): boolean {
		this.validateScope();
		return this.pickerId !== null && this.version === version;
	}
	open = (): void => {
		if (this.pickerId) return;
		this.scope = this.deps.getScope();
		this.importImage = this.deps.createImport();
		this.pickerId = crypto.randomUUID();
		this.update({ ...initialState(), open: true });
		void this.refresh();
	};
	close = (): void => {
		const pickerId = this.pickerId;
		this.pickerId = null;
		this.scope = null;
		this.version += 1;
		this.prepared = null;
		this.importImage = null;
		this.update(initialState());
		if (pickerId)
			void this.deps.api.release({ pickerId }).catch(() => undefined);
	};
	setSearch = (search: string): void => this.update({ search });
	refresh = async (): Promise<void> => {
		if (
			!this.pickerId ||
			this.state.saving ||
			this.state.loading ||
			this.state.capturing
		)
			return;
		const version = ++this.version;
		this.prepared = null;
		this.update({
			loading: true,
			sources: [],
			selectedSourceId: null,
			error: null,
		});
		try {
			const { sources } = await this.deps.api.list({ pickerId: this.pickerId });
			if (this.isCurrent(version)) this.update({ sources });
		} catch (error) {
			if (this.isCurrent(version))
				this.update({ error: errorCode(error, "window_capture_failed") });
		} finally {
			if (this.isCurrent(version)) this.update({ loading: false });
		}
	};
	select = async (sourceId: string): Promise<void> => {
		if (
			!this.isCurrent(this.version) ||
			!this.pickerId ||
			!this.importImage ||
			this.state.saving ||
			this.state.loading ||
			this.state.capturing ||
			!this.state.sources.some((source) => source.sourceId === sourceId)
		)
			return;
		const version = ++this.version;
		const importImage = this.importImage;
		let fallback = "window_capture_failed";
		if (this.prepared?.sourceId !== sourceId) this.prepared = null;
		this.update({
			selectedSourceId: sourceId,
			capturing: true,
			error: null,
		});
		try {
			if (!this.prepared) {
				const screenshot = await this.deps.api.capture({
					pickerId: this.pickerId,
					sourceId,
				});
				if (!this.isCurrent(version)) return;
				// 不传播窗口标题、句柄、捕获时间或临时来源 ID 到附件元数据。
				this.prepared = {
					sourceId,
					image: {
						mimeType: "image/png",
						dataUrl: screenshot.dataUrl,
						byteSize: screenshot.byteSize,
						width: screenshot.width,
						height: screenshot.height,
						title: this.deps.filename(),
					},
				};
			}
			if (!this.isCurrent(version)) return;
			fallback = "image_import_failed";
			this.update({ capturing: false, saving: true });
			await importImage(this.prepared.image, () => !this.isCurrent(version));
			if (this.isCurrent(version)) this.close();
		} catch (error) {
			if (this.isCurrent(version))
				this.update({ error: errorCode(error, fallback) });
		} finally {
			if (this.isCurrent(version))
				this.update({ capturing: false, saving: false });
		}
	};
}
