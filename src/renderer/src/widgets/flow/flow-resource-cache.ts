import { getFlowArtifact } from "@/platform/rpc/flow-api";

// 仅缓存预览结果；节点 DOM 卸载不重新请求，缓存有独立的字节上限
const previews = new Map<string, { source: string; bytes: number }>();
const pending = new Map<string, Promise<string | null>>();
let bytes = 0;
const MAX_BYTES = 16 * 1024 * 1024;

export function getFlowPreviewSource(id: string, mimeType: string): Promise<string | null> {
	const cached = previews.get(id);
	if (cached) {
		previews.delete(id);
		previews.set(id, cached);
		return Promise.resolve(cached.source);
	}
	const inflight = pending.get(id);
	if (inflight) return inflight;
	const task = getFlowArtifact(id, true)
		.then((response) => {
			if (!response.dataBase64) return null;
			const source = `data:${mimeType};base64,${response.dataBase64}`;
			const size = source.length * 2;
			if (size <= MAX_BYTES) {
				while (bytes + size > MAX_BYTES && previews.size) {
					const first = previews.entries().next().value!;
					bytes -= first[1].bytes;
					previews.delete(first[0]);
				}
				previews.set(id, { source, bytes: size });
				bytes += size;
			}
			return source;
		})
		.finally(() => pending.delete(id));
	pending.set(id, task);
	return task;
}
