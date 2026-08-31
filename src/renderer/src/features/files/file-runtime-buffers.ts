import type { FileBuffer } from "@/domain/files/file-buffer";
import { FileRuntimeBufferCache } from "./file-runtime-buffer-cache";

export const FILE_RUNTIME_BUFFERS: FileRuntimeBufferCache<FileBuffer> = new FileRuntimeBufferCache();

function sessionBufferPrefix(sessionId: string): string {
	return `${sessionId}\u0000`;
}

export function hasDirtyFilePanelBuffersForSession(sessionId: string): boolean {
	const prefix: string = sessionBufferPrefix(sessionId);
	return FILE_RUNTIME_BUFFERS.hasDirtyWhere((key: string): boolean => key.startsWith(prefix));
}

export function clearCleanFilePanelBuffersForSession(sessionId: string): void {
	const prefix: string = sessionBufferPrefix(sessionId);
	FILE_RUNTIME_BUFFERS.deleteCleanWhere((key: string): boolean => key.startsWith(prefix));
}
