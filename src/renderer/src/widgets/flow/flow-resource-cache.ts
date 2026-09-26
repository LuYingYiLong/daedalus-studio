import { getFlowArtifact, thumbnailFlowArtifact } from "@/platform/rpc/flow-api";

// 仅缓存预览结果；节点 DOM 卸载不重新请求，缓存有独立的字节上限
const previews = new Map<string, { source: string; bytes: number; createdAt: number }>();
const pending = new Map<string, Promise<string | null>>();
let bytes = 0;
const MAX_BYTES = 16 * 1024 * 1024;

export function getFlowPreviewSource(flowId: string, id: string, mimeType: string, byteSize: number, thumbnail = false): Promise<string | null> {
	const artifactId = id;
	if (thumbnail) id = `thumb:${id}`;
	const cached = previews.get(id);
	if (cached && (thumbnail || Date.now() - cached.createdAt < 45 * 60_000)) {
		previews.delete(id);
		previews.set(id, cached);
		return Promise.resolve(cached.source);
	}
	const inflight = pending.get(id);
	if (inflight) return inflight;
	const loadEmbedded = (): Promise<{ source: string; bytes: number } | null> =>
		(thumbnail ? thumbnailFlowArtifact(flowId, artifactId) : getFlowArtifact(flowId, artifactId, true)).then((response) => {
			if (!response.dataBase64) return null;
			const source = `data:${thumbnail ? "image/png" : mimeType};base64,${response.dataBase64}`;
			return { source, bytes: source.length * 2 };
		});
	const task = (!thumbnail && window.electronAPI?.sessionFs?.createFlowArtifactMediaUrl
		? window.electronAPI.sessionFs.createFlowArtifactMediaUrl({ artifactId, mimeType, byteSize }).then((source) => ({ source, bytes: 0 })).catch(loadEmbedded)
		: loadEmbedded())
		.then((value) => {
			if (value === null) return null;
			const { source, bytes: size } = value;
			if (size <= MAX_BYTES) {
				while (bytes + size > MAX_BYTES && previews.size) {
					const first = previews.entries().next().value!;
					bytes -= first[1].bytes;
					previews.delete(first[0]);
				}
				previews.set(id, { source, bytes: size, createdAt: Date.now() });
				bytes += size;
				while (previews.size > 128) { const first = previews.entries().next().value!; bytes -= first[1].bytes; previews.delete(first[0]); }
			}
			return source;
		})
		.finally(() => pending.delete(id));
	pending.set(id, task);
	return task;
}
