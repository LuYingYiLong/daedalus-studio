import { protocol } from "electron";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

export type WorkspaceMediaKind = "image" | "audio" | "video";

export type WorkspaceMediaDescriptor = {
	kind: WorkspaceMediaKind;
	mimeType: string;
};

export type WorkspaceMediaUrlResult = {
	supported: boolean;
	kind?: WorkspaceMediaKind;
	mimeType?: string;
	url?: string;
	byteSize: number;
	modifiedAtMs: number;
	relativePath: string;
};

type MediaToken = {
	target: string;
	kind: WorkspaceMediaKind;
	mimeType: string;
	byteSize: number;
	modifiedAtMs: number;
	expiresAt: number;
};

const MEDIA_SCHEME: string = "daedalus-media";
const MEDIA_TOKEN_TTL_MS: number = 60 * 60 * 1000;
const MAX_MEDIA_TOKENS: number = 256;
const MAX_MEDIA_BYTE_SIZE: number = 4 * 1024 * 1024 * 1024;
const mediaTokens: Map<string, MediaToken> = new Map();
let protocolRegistered: boolean = false;

const MEDIA_TYPES: Readonly<Record<string, WorkspaceMediaDescriptor>> = {
	".avif": { kind: "image", mimeType: "image/avif" },
	".bmp": { kind: "image", mimeType: "image/bmp" },
	".gif": { kind: "image", mimeType: "image/gif" },
	".ico": { kind: "image", mimeType: "image/x-icon" },
	".jpeg": { kind: "image", mimeType: "image/jpeg" },
	".jpg": { kind: "image", mimeType: "image/jpeg" },
	".png": { kind: "image", mimeType: "image/png" },
	".webp": { kind: "image", mimeType: "image/webp" },
	".aac": { kind: "audio", mimeType: "audio/aac" },
	".flac": { kind: "audio", mimeType: "audio/flac" },
	".m4a": { kind: "audio", mimeType: "audio/mp4" },
	".mp3": { kind: "audio", mimeType: "audio/mpeg" },
	".oga": { kind: "audio", mimeType: "audio/ogg" },
	".ogg": { kind: "audio", mimeType: "audio/ogg" },
	".opus": { kind: "audio", mimeType: "audio/ogg" },
	".wav": { kind: "audio", mimeType: "audio/wav" },
	".m4v": { kind: "video", mimeType: "video/mp4" },
	".mov": { kind: "video", mimeType: "video/quicktime" },
	".mp4": { kind: "video", mimeType: "video/mp4" },
	".ogv": { kind: "video", mimeType: "video/ogg" },
	".webm": { kind: "video", mimeType: "video/webm" }
};

export function getWorkspaceMediaDescriptor(relativePath: string): WorkspaceMediaDescriptor | null {
	return MEDIA_TYPES[extname(relativePath).toLowerCase()] ?? null;
}

function pruneMediaTokens(now: number = Date.now()): void {
	for (const [token, value] of mediaTokens) {
		if (value.expiresAt <= now) mediaTokens.delete(token);
	}
	while (mediaTokens.size > MAX_MEDIA_TOKENS) {
		const oldestToken: string | undefined = mediaTokens.keys().next().value;
		if (oldestToken === undefined) break;
		mediaTokens.delete(oldestToken);
	}
}

export function createWorkspaceMediaUrl(params: {
	target: string;
	relativePath: string;
	descriptor: WorkspaceMediaDescriptor;
	byteSize: number;
	modifiedAtMs: number;
}): string {
	pruneMediaTokens();
	const token: string = randomUUID();
	mediaTokens.set(token, {
		target: params.target,
		kind: params.descriptor.kind,
		mimeType: params.descriptor.mimeType,
		byteSize: params.byteSize,
		modifiedAtMs: params.modifiedAtMs,
		expiresAt: Date.now() + MEDIA_TOKEN_TTL_MS
	});
	return `${MEDIA_SCHEME}://file/${token}/${encodeURIComponent(basename(params.relativePath))}`;
}

export async function createFlowArtifactMediaUrl(params: { artifactId: string; mimeType: string; byteSize: number }): Promise<string> {
	if (!/^flow-artifact-[A-Za-z0-9_-]+$/u.test(params.artifactId) || !/^(image|video|audio)\/[A-Za-z0-9.+-]+$/u.test(params.mimeType) || !Number.isSafeInteger(params.byteSize) || params.byteSize <= 0 || params.byteSize > MAX_MEDIA_BYTE_SIZE)
		throw new Error("flow_artifact_media_invalid");
	const extension = params.mimeType.split("/")[1]!.replace(/[^a-z0-9]+/giu, "").slice(0, 12) || "bin";
	const home = process.env.USERPROFILE?.trim() || (process.platform === "win32" ? undefined : process.env.HOME?.trim());
	if (!home) throw new Error("flow_artifact_media_home_unavailable");
	const root = await realpath(resolve(home, ".daedalus", "flow-artifacts"));
	const fileName = `${params.artifactId}.${extension}`;
	const target = await realpath(join(root, fileName));
	const inside = relative(root, target);
	if (inside.startsWith("..") || isAbsolute(inside) || inside !== fileName) throw new Error("flow_artifact_media_scope_invalid");
	const info = await stat(target);
	if (!info.isFile() || info.size !== params.byteSize) throw new Error("flow_artifact_media_changed");
	return createWorkspaceMediaUrl({ target, relativePath: fileName, descriptor: { kind: params.mimeType.startsWith("image/") ? "image" : params.mimeType.startsWith("video/") ? "video" : "audio", mimeType: params.mimeType }, byteSize: info.size, modifiedAtMs: info.mtimeMs });
}

function getRange(rangeHeader: string | null, byteSize: number): { start: number; end: number } | null {
	if (rangeHeader === null || !rangeHeader.startsWith("bytes=")) return null;
	const value: string = rangeHeader.slice("bytes=".length).split(",", 1)[0] ?? "";
	const [startText, endText] = value.split("-", 2);
	const start: number = startText === "" ? Math.max(0, byteSize - Number(endText) || 0) : Number(startText);
	const end: number = endText === "" ? byteSize - 1 : Number(endText);
	if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= byteSize) return null;
	return { start, end: Math.min(end, byteSize - 1) };
}

async function handleMediaRequest(request: Request): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
	pruneMediaTokens();
	const url: URL = new URL(request.url);
	const pathSegments: string[] = url.pathname.split("/").filter(Boolean);
	const token: string | undefined = url.hostname === "file" ? pathSegments[0] : undefined;
	if (token === undefined) return new Response("Not found", { status: 404 });
	const mediaToken: MediaToken | undefined = mediaTokens.get(token);
	if (mediaToken === undefined) return new Response("Not found", { status: 404 });
	try {
		const currentTarget: string = await realpath(mediaToken.target);
		if (currentTarget !== mediaToken.target) return new Response("Media target changed", { status: 410 });
		const currentStats = await stat(mediaToken.target);
		if (!currentStats.isFile() || currentStats.size !== mediaToken.byteSize || currentStats.mtimeMs !== mediaToken.modifiedAtMs) {
			return new Response("Media changed", { status: 410 });
		}
		const range: { start: number; end: number } | null = getRange(request.headers.get("range"), mediaToken.byteSize);
		if (request.headers.has("range") && range === null) return new Response("Range not satisfiable", { status: 416 });
		const start: number = range?.start ?? 0;
		const end: number = range?.end ?? mediaToken.byteSize - 1;
		const headers: Headers = new Headers({
			"Accept-Ranges": "bytes",
			"Cache-Control": "no-store",
			"Content-Length": String(Math.max(0, end - start + 1)),
			"Content-Type": mediaToken.mimeType,
			...(range === null ? {} : { "Content-Range": `bytes ${start}-${end}/${mediaToken.byteSize}` })
		});
		if (request.method === "HEAD") return new Response(null, { status: range === null ? 200 : 206, headers });
		const stream = createReadStream(mediaToken.target, { start, end });
		return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range === null ? 200 : 206, headers });
	} catch {
		return new Response("Not found", { status: 404 });
	}
}

export function registerWorkspaceMediaProtocol(): void {
	if (protocolRegistered) return;
	protocol.handle(MEDIA_SCHEME, handleMediaRequest);
	protocolRegistered = true;
}

export function getWorkspaceMediaMaxByteSize(): number {
	return MAX_MEDIA_BYTE_SIZE;
}
