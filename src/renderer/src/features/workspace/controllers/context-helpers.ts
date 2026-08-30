import type { AdditionalContextItem, WorkspaceConfig, WorkspaceKind } from "@/platform/rpc/types";
import type { SaveImageAttachmentParams } from "@/platform/rpc/image-attachment-api";

export type SupportedImageMimeType = SaveImageAttachmentParams["mimeType"];

export type WorkspacePickedEntry = {
	name: string;
	relativePath: string;
	resourcePath: string;
	kind: "file" | "folder";
};

export const SUPPORTED_IMAGE_MIME_TYPES: readonly SupportedImageMimeType[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_IMAGE_ATTACHMENT_BYTES: number = 5 * 1024 * 1024;
export const RECENT_CONTEXT_FILE_WINDOW_MS: number = 2000;
export const CONTEXT_SUBTITLE_MAX_CHARS: number = 400;

export function createSingleSourceWorkspaceSnapshot(params: { id: string; name: string; rootPath: string; kind?: WorkspaceKind; godotExecutablePath?: string }): WorkspaceConfig {
	const primarySourceFolderId = "primary";
	const kind: WorkspaceKind = params.kind ?? "workspace";
	return {
		id: params.id,
		name: params.name,
		kind,
		rootPath: params.rootPath,
		icon: 0,
		color: 0,
		sourceFolders: [{ id: primarySourceFolderId, path: params.rootPath, capabilities: { git: false, godot: kind === "godot" } }],
		primarySourceFolderId,
		godotExecutablePath: params.godotExecutablePath
	};
}

export function createContextId(): string {
	return typeof crypto.randomUUID === "function"
		? `studio-context-${crypto.randomUUID()}`
		: `studio-context-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getContextTitle(entry: WorkspacePickedEntry): string {
	return entry.name.trim().length > 0 ? entry.name : entry.resourcePath.split("/").filter(Boolean).at(-1) ?? entry.resourcePath;
}

export function createWorkspacePathContextItem(entry: WorkspacePickedEntry, workspace: WorkspaceConfig): AdditionalContextItem {
	return {
		id: createContextId(),
		kind: entry.kind,
		title: getContextTitle(entry),
		subtitle: entry.resourcePath,
		source: "manual",
		resourcePath: entry.resourcePath,
		data: { workspaceId: workspace.id, workspaceRoot: workspace.rootPath, relativePath: entry.relativePath }
	};
}

export function clipContextLabel(value: string, maxChars: number): string {
	return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function getFileNameFromLocalPath(filePath: string): string {
	return filePath.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? filePath;
}

export function createExternalFileContextItem(file: File, absolutePath: string): AdditionalContextItem {
	const data: Record<string, unknown> = { external: true, absolutePath };
	if (file.type.trim().length > 0) data.mimeType = file.type;
	if (file.size > 0) data.byteSize = file.size;
	if (file.lastModified > 0) data.lastModified = file.lastModified;
	return {
		id: createContextId(),
		kind: "file",
		title: clipContextLabel(file.name.trim() || getFileNameFromLocalPath(absolutePath), 200),
		subtitle: clipContextLabel(absolutePath, CONTEXT_SUBTITLE_MAX_CHARS),
		source: "manual",
		resourcePath: absolutePath,
		summary: "User explicitly dropped this local file from outside the workspace; use the absolute path as the reference for this turn.",
		data
	};
}

export function normalizeLocalPathForCompare(filePath: string): string {
	const normalized: string = filePath.trim().replaceAll("\\", "/");
	const rootAwarePath: string = /^[A-Za-z]:\/?$/u.test(normalized)
		? normalized.replace(/\/?$/u, "/")
		: normalized.length > 1 ? normalized.replace(/\/+$/u, "") : normalized;
	return /^[A-Za-z]:\//u.test(rootAwarePath) || rootAwarePath.startsWith("//") ? rootAwarePath.toLowerCase() : rootAwarePath;
}

export function isLocalPathInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
	const normalizedFilePath: string = normalizeLocalPathForCompare(filePath);
	const normalizedWorkspaceRoot: string = normalizeLocalPathForCompare(workspaceRoot);
	return normalizedFilePath === normalizedWorkspaceRoot || normalizedFilePath.startsWith(`${normalizedWorkspaceRoot}/`);
}

export function isSupportedImageMimeType(value: string): value is SupportedImageMimeType {
	return SUPPORTED_IMAGE_MIME_TYPES.includes(value as SupportedImageMimeType);
}

export function resolveSupportedImageMimeType(file: File): SupportedImageMimeType | null {
	const normalizedMimeType: string = file.type.trim().toLowerCase();
	if (normalizedMimeType === "image/jpg") {
		return "image/jpeg";
	}
	if (isSupportedImageMimeType(normalizedMimeType)) {
		return normalizedMimeType;
	}

	const extension: string = file.name.trim().toLowerCase().split(".").at(-1) ?? "";
	switch (extension) {
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "webp":
			return "image/webp";
		case "gif":
			return "image/gif";
		default:
			return null;
	}
}

export function getLocalPathForFile(file: File): string | null {
	try {
		const filePath: string = window.electronAPI.workspaceFs.getPathForFile(file);
		return filePath.trim().length > 0 ? filePath : null;
	} catch {
		const legacyPath: unknown = (file as File & { path?: unknown }).path;
		return typeof legacyPath === "string" && legacyPath.trim().length > 0 ? legacyPath : null;
	}
}

export function createContextFileSignature(file: File): string {
	return [getLocalPathForFile(file) ?? "", file.name, file.type, String(file.size), String(file.lastModified)].join("\u0000");
}

export function readFileAsDataUrl(file: File, mimeType: SupportedImageMimeType = file.type as SupportedImageMimeType): Promise<string> {
	return new Promise((resolve, reject): void => {
		const reader = new FileReader();
		reader.addEventListener("load", (): void => {
			if (typeof reader.result !== "string") {
				reject(new Error("Failed to read image file."));
				return;
			}
			const separatorIndex: number = reader.result.indexOf(",");
			if (separatorIndex < 0) {
				reject(new Error("Failed to encode image file."));
				return;
			}
			resolve(`data:${mimeType};base64,${reader.result.slice(separatorIndex + 1)}`);
		});
		reader.addEventListener("error", (): void => reject(reader.error ?? new Error("Failed to read image file.")));
		reader.readAsDataURL(file);
	});
}

export function readImageDimensions(dataUrl: string): Promise<{ width?: number; height?: number }> {
	return new Promise((resolve): void => {
		const image = new window.Image();
		image.onload = (): void => resolve({ width: image.naturalWidth > 0 ? image.naturalWidth : undefined, height: image.naturalHeight > 0 ? image.naturalHeight : undefined });
		image.onerror = (): void => resolve({});
		image.src = dataUrl;
	});
}
