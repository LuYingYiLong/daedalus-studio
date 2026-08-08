export const SESSION_NAVIGATION_EVENT: string = "daedalus:session-navigation";

export type SessionNavigationSnapshot = {
	sessionIds: readonly string[];
	currentIndex: number;
	canGoBack: boolean;
	canGoForward: boolean;
};

type SessionNavigationDirection = "back" | "forward";

const MAX_SESSION_HISTORY_ENTRIES: number = 50;
const listeners: Set<() => void> = new Set<() => void>();
let sessionIds: string[] = [];
let currentIndex: number = -1;
let snapshot: SessionNavigationSnapshot = createSnapshot();

function createSnapshot(): SessionNavigationSnapshot {
	return {
		sessionIds,
		currentIndex,
		canGoBack: currentIndex > 0,
		canGoForward: currentIndex >= 0 && currentIndex < sessionIds.length - 1
	};
}

function publish(): void {
	snapshot = createSnapshot();
	for (const listener of listeners) {
		listener();
	}
}

export function getSessionNavigationSnapshot(): SessionNavigationSnapshot {
	return snapshot;
}

export function subscribeToSessionNavigation(listener: () => void): () => void {
	listeners.add(listener);
	return (): void => {
		listeners.delete(listener);
	};
}

export function recordOpenedSession(sessionId: string): void {
	if (sessionId.length === 0 || sessionIds[currentIndex] === sessionId) {
		return;
	}

	const nextSessionIds: string[] = [...sessionIds.slice(0, currentIndex + 1), sessionId];
	const firstIncludedIndex: number = Math.max(0, nextSessionIds.length - MAX_SESSION_HISTORY_ENTRIES);
	sessionIds = nextSessionIds.slice(firstIncludedIndex);
	currentIndex = sessionIds.length - 1;
	publish();
}

export function navigateSessionHistory(direction: SessionNavigationDirection): string | null {
	const nextIndex: number = direction === "back" ? currentIndex - 1 : currentIndex + 1;
	const sessionId: string | undefined = sessionIds[nextIndex];
	if (sessionId === undefined) {
		return null;
	}

	currentIndex = nextIndex;
	publish();
	return sessionId;
}

export function removeSessionFromNavigationHistory(sessionId: string): void {
	const nextSessionIds: string[] = sessionIds.filter((candidate: string): boolean => candidate !== sessionId);
	if (nextSessionIds.length === sessionIds.length) {
		return;
	}

	const removedBeforeCurrent: number = sessionIds.slice(0, Math.max(0, currentIndex + 1)).filter(
		(candidate: string): boolean => candidate === sessionId
	).length;
	sessionIds = nextSessionIds;
	currentIndex = sessionIds.length === 0
		? -1
		: Math.min(sessionIds.length - 1, Math.max(0, currentIndex - removedBeforeCurrent));
	publish();
}
