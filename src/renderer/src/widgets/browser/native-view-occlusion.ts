type OcclusionListener = (occluded: boolean) => void;

const listeners: Set<OcclusionListener> = new Set();
let observer: MutationObserver | null = null;
let occluded: boolean = false;
let scheduledFrame: number | null = null;

function readOcclusion(): boolean {
	const overlays: Element[] = [...document.querySelectorAll(
		".ant-modal-wrap, .ant-drawer-mask, .ant-drawer-content-wrapper, .ant-dropdown, .ant-popover"
	)];
	return overlays.some((overlay: Element): boolean => {
		return overlay instanceof HTMLElement
			&& overlay.getClientRects().length > 0
			&& window.getComputedStyle(overlay).visibility !== "hidden";
	});
}

function updateOcclusion(): void {
	scheduledFrame = null;
	const next: boolean = readOcclusion();
	if (next === occluded) return;
	occluded = next;
	for (const listener of listeners) listener(occluded);
}

function scheduleUpdate(): void {
	if (scheduledFrame !== null) return;
	scheduledFrame = window.requestAnimationFrame(updateOcclusion);
}

function start(): void {
	if (observer !== null) return;
	observer = new MutationObserver(scheduleUpdate);
	observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style"], childList: true, subtree: true });
	occluded = readOcclusion();
}

function stop(): void {
	observer?.disconnect();
	observer = null;
	if (scheduledFrame !== null) window.cancelAnimationFrame(scheduledFrame);
	scheduledFrame = null;
	occluded = false;
}

export function subscribeNativeViewOcclusion(listener: OcclusionListener): () => void {
	listeners.add(listener);
	start();
	listener(occluded);
	return (): void => {
		listeners.delete(listener);
		if (listeners.size === 0) stop();
	};
}
