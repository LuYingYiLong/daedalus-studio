import { useEffect, useState } from "react";

export const MASCOT_IDLE_SLEEP_TIMEOUT_MS: number = 3 * 60 * 1000;

/** 空闲三分钟后进入休眠，窗口或鼠标再次活动时唤醒 */
export function useMascotSleep(enabled: boolean): boolean {
	const [sleeping, setSleeping] = useState<boolean>(false);

	useEffect((): (() => void) | undefined => {
		if (!enabled) {
			setSleeping(false);
			return undefined;
		}

		let timeoutId: number = window.setTimeout((): void => {
			setSleeping(true);
		}, MASCOT_IDLE_SLEEP_TIMEOUT_MS);
		let lastActivityAt: number = 0;
		const wake = (): void => {
			setSleeping(false);
			const now: number = Date.now();
			if (now - lastActivityAt < 1000) return;
			lastActivityAt = now;
			window.clearTimeout(timeoutId);
			timeoutId = window.setTimeout((): void => {
				setSleeping(true);
			}, MASCOT_IDLE_SLEEP_TIMEOUT_MS);
		};

		window.addEventListener("pointermove", wake, { passive: true });
		window.addEventListener("pointerdown", wake, { passive: true });
		window.addEventListener("keydown", wake);
		window.addEventListener("focus", wake);
		document.addEventListener("visibilitychange", wake);
		return (): void => {
			window.clearTimeout(timeoutId);
			window.removeEventListener("pointermove", wake);
			window.removeEventListener("pointerdown", wake);
			window.removeEventListener("keydown", wake);
			window.removeEventListener("focus", wake);
			document.removeEventListener("visibilitychange", wake);
		};
	}, [enabled]);

	return sleeping;
}
