import useBackendEventStream, { type BackendEventStreamParams } from "./useBackendEventStream";

export type AppEventBridgeParams = BackendEventStreamParams;

export default function useAppEventBridge(params: AppEventBridgeParams): void {
	useBackendEventStream(params);
}

