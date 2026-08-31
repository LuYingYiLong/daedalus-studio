export type AnimationFrameScheduler = (callback: FrameRequestCallback) => number;

export async function waitForGlobalStyles(
	documentRef: Document = document,
	scheduleFrame: AnimationFrameScheduler = globalThis.requestAnimationFrame.bind(globalThis)
): Promise<void> {
	if (globalThis.getComputedStyle(documentRef.documentElement).getPropertyValue("--ds-bg").trim().length > 0) {
		return;
	}
	await new Promise<void>((resolve): void => {
		const check = (): void => {
			if (globalThis.getComputedStyle(documentRef.documentElement).getPropertyValue("--ds-bg").trim().length > 0) {
				resolve();
				return;
			}
			scheduleFrame(check);
		};
		scheduleFrame(check);
	});
}

/**
 * Waits until React's committed tree has crossed a paint boundary. The second
 * frame prevents the main process from showing the native window in the same
 * frame that mounted BootSplash and injected Ant Design styles.
 */
export async function waitForRendererPaint(
	scheduleFrame: AnimationFrameScheduler = globalThis.requestAnimationFrame.bind(globalThis)
): Promise<void> {
	await new Promise<void>((resolve): void => {
		scheduleFrame((): void => {
			scheduleFrame((): void => resolve());
		});
	});
}
