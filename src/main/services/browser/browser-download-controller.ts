import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { app, shell, type BrowserWindow, type DownloadItem, type Session, type WebContents } from "electron";
import type { BrowserDownloadRecord, BrowserSettings } from "../../../contracts/browser";
import type { BrowserDataStore } from "./browser-data-store";

export class BrowserDownloadController {
	private readonly activeDownloads: Map<string, DownloadItem> = new Map();
	private attached: boolean = false;

	constructor(
		private readonly dataStore: BrowserDataStore,
		private readonly getMainWindow: () => BrowserWindow | null
	) {}

	attach(browserSession: Session, ownsContents: (contents: WebContents) => boolean): void {
		if (this.attached) return;
		browserSession.on("will-download", (_event, item, contents): void => {
			if (ownsContents(contents)) void this.track(item);
		});
		this.attached = true;
	}

	list(): Promise<BrowserDownloadRecord[]> { return this.dataStore.listDownloads(); }

	cancel(id: string): void { this.activeDownloads.get(id)?.cancel(); }

	async open(id: string): Promise<void> {
		const record = (await this.dataStore.listDownloads()).find((item): boolean => item.id === id);
		if (record === undefined) throw new Error("browser_download_not_found");
		const error: string = await shell.openPath(record.savePath);
		if (error.length > 0) throw new Error(error);
	}

	async reveal(id: string): Promise<void> {
		const record = (await this.dataStore.listDownloads()).find((item): boolean => item.id === id);
		if (record === undefined) throw new Error("browser_download_not_found");
		shell.showItemInFolder(record.savePath);
	}

	async remove(id: string): Promise<void> {
		this.activeDownloads.get(id)?.cancel();
		this.activeDownloads.delete(id);
		await this.dataStore.removeDownload(id);
	}

	clear(): Promise<void> { return this.dataStore.clearDownloads(); }

	cancelAll(): void {
		for (const item of this.activeDownloads.values()) item.cancel();
		this.activeDownloads.clear();
	}

	private async track(item: DownloadItem): Promise<void> {
		const id: string = randomUUID();
		const settings: BrowserSettings = await this.dataStore.getSettings();
		const directory: string = settings.downloadDirectory ?? app.getPath("downloads");
		const fileName: string = basename(item.getFilename());
		if (settings.askWhereToSave) item.setSaveDialogOptions({ defaultPath: join(directory, fileName) });
		else item.setSavePath(join(directory, fileName));
		const record: BrowserDownloadRecord = {
			id,
			url: item.getURL(),
			fileName,
			savePath: item.getSavePath(),
			receivedBytes: 0,
			totalBytes: item.getTotalBytes(),
			state: "progressing",
			startedAt: new Date().toISOString(),
			finishedAt: null
		};
		this.activeDownloads.set(id, item);
		await this.publish(record);
		item.on("updated", (_event, state): void => {
			record.savePath = item.getSavePath();
			record.receivedBytes = item.getReceivedBytes();
			record.totalBytes = item.getTotalBytes();
			record.state = state === "interrupted" ? "interrupted" : "progressing";
			void this.publish(record);
		});
		item.once("done", (_event, state): void => {
			record.savePath = item.getSavePath();
			record.receivedBytes = item.getReceivedBytes();
			record.totalBytes = item.getTotalBytes();
			record.state = state;
			record.finishedAt = new Date().toISOString();
			this.activeDownloads.delete(id);
			void this.publish(record);
		});
	}

	private async publish(record: BrowserDownloadRecord): Promise<void> {
		await this.dataStore.upsertDownload({ ...record });
		this.getMainWindow()?.webContents.send("browser:download-changed", { ...record });
	}
}
