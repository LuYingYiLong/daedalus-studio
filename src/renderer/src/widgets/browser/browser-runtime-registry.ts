import type { DockPanelPlacement } from "@/widgets/dock/DockPanelTabs";

export type BrowserRuntimeRegistration = {
	browserId: string;
	panelKey: string;
	sessionId: string | null;
	placement: DockPanelPlacement;
	visible: boolean;
	active: boolean;
	lastInteractionAt: number;
};

const registrations: Map<string, BrowserRuntimeRegistration> = new Map();
const listeners: Set<() => void> = new Set();

function notify(): void {
	for (const listener of listeners) listener();
}

export function registerBrowserRuntime(registration: BrowserRuntimeRegistration): () => void {
	registrations.set(registration.browserId, registration);
	notify();
	return (): void => {
		registrations.delete(registration.browserId);
		notify();
	};
}

export function updateBrowserRuntime(browserId: string, patch: Partial<BrowserRuntimeRegistration>): void {
	const current: BrowserRuntimeRegistration | undefined = registrations.get(browserId);
	if (current === undefined) return;
	registrations.set(browserId, { ...current, ...patch });
	notify();
}

export function findBrowserRuntime(sessionId: string): BrowserRuntimeRegistration | null {
	const candidates: BrowserRuntimeRegistration[] = [...registrations.values()].filter((item): boolean => item.sessionId === sessionId);
	const visible = candidates.filter((item): boolean => item.visible && item.active).sort((left, right): number => right.lastInteractionAt - left.lastInteractionAt)[0];
	if (visible !== undefined) return visible;
	return candidates.find((item): boolean => item.placement === "side")
		?? candidates.find((item): boolean => item.placement === "bottom")
		?? null;
}

export function waitForBrowserRuntime(sessionId: string, timeoutMs: number = 5000): Promise<BrowserRuntimeRegistration> {
	const existing: BrowserRuntimeRegistration | null = findBrowserRuntime(sessionId);
	if (existing !== null) return Promise.resolve(existing);
	return new Promise<BrowserRuntimeRegistration>((resolve, reject): void => {
		const timer: number = window.setTimeout((): void => {
			listeners.delete(check);
			reject(new Error("browser_runtime_timeout"));
		}, timeoutMs);
		const check = (): void => {
			const next: BrowserRuntimeRegistration | null = findBrowserRuntime(sessionId);
			if (next === null) return;
			window.clearTimeout(timer);
			listeners.delete(check);
			resolve(next);
		};
		listeners.add(check);
	});
}
