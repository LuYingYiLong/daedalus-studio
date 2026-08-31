import type {
	ExternalBrowserApi,
	ExternalBrowserState,
} from "../../../../contracts/external-browser";

export function subscribeExternalBrowserState(
	api: Pick<ExternalBrowserApi, "getState" | "onState">,
	listener: (state: ExternalBrowserState) => void,
): () => void {
	let alive = true;
	let receivedEvent = false;
	const off = api.onState((state) => {
		receivedEvent = true;
		if (alive) listener(state);
	});
	void api
		.getState()
		.then((state) => {
			// IPC 快照可能晚于新连接事件返回，不能用旧快照覆盖当前状态
			if (alive && !receivedEvent) listener(state);
		})
		.catch(() => {});
	return () => {
		alive = false;
		off();
	};
}
