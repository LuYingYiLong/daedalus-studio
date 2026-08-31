import { useRef } from "react";
import { useMemoizedFn } from "ahooks";

export type NativeTaskNotificationsController = {
	showNativeTaskNotification: (payload: NativeNotificationPayload) => void;
	clearNativeTaskNotificationAttention: () => void;
};

function useNativeTaskNotifications(): NativeTaskNotificationsController {
	const dedupeKeysRef = useRef<Set<string>>(new Set());

	const showNativeTaskNotification = useMemoizedFn((payload: NativeNotificationPayload): void => {
		if (dedupeKeysRef.current.has(payload.dedupeKey)) {
			return;
		}

		dedupeKeysRef.current.add(payload.dedupeKey);
		void window.electronAPI.nativeNotifications.show(payload).catch((error: unknown): void => {
			console.error("[App] native notification failed", error);
		});
	});

	const clearNativeTaskNotificationAttention = useMemoizedFn((): void => {
		dedupeKeysRef.current.clear();
		void window.electronAPI.nativeNotifications.clearAttention().catch((error: unknown): void => {
			console.error("[App] clear native notification attention failed", error);
		});
	});

	return {
		showNativeTaskNotification,
		clearNativeTaskNotificationAttention
	};
}

export default useNativeTaskNotifications;
