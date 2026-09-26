import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	nativeImage,
	protocol,
	type OpenDialogOptions,
	type OpenDialogReturnValue
} from "electron";
import type { Dirent } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	APPEARANCE_BACKGROUND_DIRECTORY_NAME,
	APPEARANCE_BACKGROUND_EXTENSION_BY_MIME,
	APPEARANCE_BACKGROUND_FILE_PATTERN,
	APPEARANCE_BACKGROUND_HOST,
	APPEARANCE_BACKGROUND_SCHEME,
	MAX_APPEARANCE_BACKGROUND_BYTES,
	MAX_APPEARANCE_BACKGROUND_EDGE,
	MIN_APPEARANCE_BACKGROUND_EDGE,
	type BackgroundImageMimeType,
	type BackgroundImagePreference
} from "../../contracts/appearance-background";
import type { ClientPreferences } from "../../contracts/client-preferences";
import { clientPreferencesService } from "./client-preferences";

const TEMPORARY_FILE_PREFIX: string = ".tmp-";
const BACKGROUND_IMAGE_JPEG_QUALITY: number = 92;
const APPEARANCE_BACKGROUND_PICK_CHANNEL: string = "appearance-background:pick";
const APPEARANCE_BACKGROUND_CLEAR_CHANNEL: string = "appearance-background:clear";

let protocolRegistered: boolean = false;
let ipcRegistered: boolean = false;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getAppearanceBackgroundDirectory(): string {
	return join(app.getPath("userData"), APPEARANCE_BACKGROUND_DIRECTORY_NAME);
}

/**
 * Only content-addressed file names produced by this module are accepted, so a
 * hand-edited preference can never make the protocol serve an arbitrary path.
 */
export function resolveBackgroundFilePath(fileName: string): string | null {
	if (!APPEARANCE_BACKGROUND_FILE_PATTERN.test(fileName)) {
		return null;
	}
	return join(getAppearanceBackgroundDirectory(), fileName);
}

function getMimeTypeForFileName(fileName: string): string {
	const extension: string = fileName.slice(fileName.lastIndexOf(".") + 1);
	for (const [mimeType, candidateExtension] of Object.entries(APPEARANCE_BACKGROUND_EXTENSION_BY_MIME)) {
		if (candidateExtension === extension) {
			return mimeType;
		}
	}
	return "application/octet-stream";
}

async function handleBackgroundRequest(request: Request): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD") {
		return new Response("Method not allowed", { status: 405 });
	}
	const url: URL = new URL(request.url);
	const segments: string[] = url.pathname.split("/").filter(Boolean);
	if (url.hostname !== APPEARANCE_BACKGROUND_HOST || segments.length !== 1) {
		return new Response("Not found", { status: 404 });
	}
	const filePath: string | null = resolveBackgroundFilePath(segments[0] ?? "");
	if (filePath === null) {
		return new Response("Not found", { status: 404 });
	}

	try {
		const fileStat = await stat(filePath);
		if (!fileStat.isFile()) {
			return new Response("Not found", { status: 404 });
		}
		const headers: Headers = new Headers({
			// The file name is the content hash, so a long-lived cache entry is safe.
			"Cache-Control": "public, max-age=31536000, immutable",
			"Content-Length": String(fileStat.size),
			"Content-Type": getMimeTypeForFileName(filePath)
		});
		if (request.method === "HEAD") {
			return new Response(null, { status: 200, headers });
		}
		return new Response(await readFile(filePath), { status: 200, headers });
	} catch {
		return new Response("Not found", { status: 404 });
	}
}

type EncodedBackgroundImage = {
	bytes: Buffer;
	mimeType: BackgroundImageMimeType;
	width: number;
	height: number;
};

function getMegabyteLabel(byteSize: number): string {
	return `${Math.round(byteSize / (1024 * 1024))}MB`;
}

/**
 * Re-encodes the selected image so metadata (EXIF/GPS) is dropped, the longest
 * edge is bounded, and the stored bytes always fit the preference byte limit.
 */
function encodeBackgroundImage(sourcePath: string): EncodedBackgroundImage {
	const image = nativeImage.createFromPath(sourcePath);
	if (image.isEmpty()) {
		throw new Error("无法解析所选图片，请选择 PNG、JPEG 或 WebP 图片。");
	}
	const sourceSize = image.getSize();
	if (sourceSize.width < MIN_APPEARANCE_BACKGROUND_EDGE || sourceSize.height < MIN_APPEARANCE_BACKGROUND_EDGE) {
		throw new Error(`图片太小：宽高至少需要 ${MIN_APPEARANCE_BACKGROUND_EDGE}px。`);
	}

	const longestEdge: number = Math.max(sourceSize.width, sourceSize.height);
	const scaled = longestEdge > MAX_APPEARANCE_BACKGROUND_EDGE
		? image.resize(sourceSize.width >= sourceSize.height
			? { width: MAX_APPEARANCE_BACKGROUND_EDGE, quality: "best" }
			: { height: MAX_APPEARANCE_BACKGROUND_EDGE, quality: "best" })
		: image;
	const size = scaled.getSize();

	const pngBytes: Buffer = scaled.toPNG();
	if (pngBytes.byteLength <= MAX_APPEARANCE_BACKGROUND_BYTES) {
		return { bytes: pngBytes, mimeType: "image/png", width: size.width, height: size.height };
	}
	const jpegBytes: Buffer = scaled.toJPEG(BACKGROUND_IMAGE_JPEG_QUALITY);
	if (jpegBytes.byteLength < pngBytes.byteLength && jpegBytes.byteLength <= MAX_APPEARANCE_BACKGROUND_BYTES) {
		return { bytes: jpegBytes, mimeType: "image/jpeg", width: size.width, height: size.height };
	}

	throw new Error(`图片处理后的体积仍然超过 ${getMegabyteLabel(MAX_APPEARANCE_BACKGROUND_BYTES)}，请先压缩图片再试。`);
}

async function storeBackgroundImage(sourcePath: string): Promise<BackgroundImagePreference> {
	const sourceStat = await stat(sourcePath);
	if (!sourceStat.isFile()) {
		throw new Error("请选择一张图片文件。");
	}
	if (sourceStat.size > MAX_APPEARANCE_BACKGROUND_BYTES) {
		throw new Error(`图片体积超过 ${getMegabyteLabel(MAX_APPEARANCE_BACKGROUND_BYTES)} 上限。`);
	}

	const encoded: EncodedBackgroundImage = encodeBackgroundImage(sourcePath);
	const sha256: string = createHash("sha256").update(encoded.bytes).digest("hex");
	const fileName: string = `${sha256}.${APPEARANCE_BACKGROUND_EXTENSION_BY_MIME[encoded.mimeType]}`;
	const directory: string = getAppearanceBackgroundDirectory();
	await mkdir(directory, { recursive: true });

	const targetPath: string = join(directory, fileName);
	const temporaryPath: string = join(directory, `${TEMPORARY_FILE_PREFIX}${randomUUID()}`);
	try {
		await writeFile(temporaryPath, encoded.bytes);
		await rename(temporaryPath, targetPath);
	} finally {
		await rm(temporaryPath, { force: true }).catch((): void => undefined);
	}

	const storedStat = await stat(targetPath);
	return {
		fileName,
		mimeType: encoded.mimeType,
		byteSize: storedStat.size,
		width: encoded.width,
		height: encoded.height,
		sha256
	};
}

/** Keeps only the active background image plus nothing else in the directory. */
async function pruneBackgroundDirectory(keepFileName: string | null): Promise<void> {
	const directory: string = getAppearanceBackgroundDirectory();
	let entries: Dirent[];
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (!entry.isFile() || entry.name === keepFileName) {
			continue;
		}
		if (!APPEARANCE_BACKGROUND_FILE_PATTERN.test(entry.name) && !entry.name.startsWith(TEMPORARY_FILE_PREFIX)) {
			continue;
		}
		await rm(join(directory, entry.name), { force: true }).catch((): void => undefined);
	}
}

export async function pickBackgroundImage(owner: BrowserWindow | null, title?: string): Promise<ClientPreferences> {
	const options: OpenDialogOptions = {
		properties: ["openFile"],
		filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
		...(title === undefined || title.trim().length === 0 ? {} : { title: title.trim().slice(0, 200) })
	};
	const result: OpenDialogReturnValue = owner === null || owner.isDestroyed()
		? await dialog.showOpenDialog(options)
		: await dialog.showOpenDialog(owner, options);
	if (result.canceled) {
		return await clientPreferencesService.load();
	}
	const sourcePath: string | undefined = result.filePaths[0];
	if (sourcePath === undefined) {
		return await clientPreferencesService.load();
	}

	const stored: BackgroundImagePreference = await storeBackgroundImage(sourcePath);
	const preferences: ClientPreferences = await clientPreferencesService.update({ backgroundImage: stored });
	await pruneBackgroundDirectory(stored.fileName);
	return preferences;
}

export async function clearBackgroundImage(): Promise<ClientPreferences> {
	const preferences: ClientPreferences = await clientPreferencesService.update({ backgroundImage: null });
	await pruneBackgroundDirectory(null);
	return preferences;
}

export function registerAppearanceBackgroundProtocol(): void {
	if (protocolRegistered) return;
	protocol.handle(APPEARANCE_BACKGROUND_SCHEME, handleBackgroundRequest);
	protocolRegistered = true;
}

export function registerAppearanceBackgroundIpc(): void {
	if (ipcRegistered) return;
	ipcMain.handle(APPEARANCE_BACKGROUND_PICK_CHANNEL, async (event, payload: unknown): Promise<ClientPreferences> => {
		const title: string | undefined = isRecord(payload) && typeof payload.title === "string" ? payload.title : undefined;
		return await pickBackgroundImage(BrowserWindow.fromWebContents(event.sender), title);
	});
	ipcMain.handle(APPEARANCE_BACKGROUND_CLEAR_CHANNEL, async (): Promise<ClientPreferences> => {
		return await clearBackgroundImage();
	});
	ipcRegistered = true;
}
