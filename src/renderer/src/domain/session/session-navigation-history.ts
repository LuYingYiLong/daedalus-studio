export const SESSION_NAVIGATION_EVENT: string = "daedalus:session-navigation";
export const SESSION_SURFACE_NAVIGATION_EVENT: string =
	"daedalus:session-surface-navigation";
export const NEW_SESSION_EVENT: string = "daedalus:new-session";

export type SessionNavigationSurface = "chat" | "flow";

export type SessionNavigationTarget = {
	sessionId: string;
	surface: SessionNavigationSurface;
};

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
let sessionSurfaces: SessionNavigationSurface[] = [];
let snapshot: SessionNavigationSnapshot = createSnapshot();

function createSnapshot(): SessionNavigationSnapshot {
	return {
		sessionIds,
		currentIndex,
		canGoBack: currentIndex > 0,
		canGoForward: currentIndex >= 0 && currentIndex < sessionIds.length - 1,
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

export function recordOpenedSession(
	sessionId: string,
	surface: SessionNavigationSurface = "chat",
): void {
	if (
		sessionId.length === 0 ||
		(sessionIds[currentIndex] === sessionId &&
			sessionSurfaces[currentIndex] === surface)
	) {
		return;
	}

	const nextSessionIds: string[] = [
		...sessionIds.slice(0, currentIndex + 1),
		sessionId,
	];
	const nextSessionSurfaces: SessionNavigationSurface[] = [
		...sessionSurfaces.slice(0, currentIndex + 1),
		surface,
	];
	const firstIncludedIndex: number = Math.max(0, nextSessionIds.length - MAX_SESSION_HISTORY_ENTRIES);
	sessionIds = nextSessionIds.slice(firstIncludedIndex);
	sessionSurfaces = nextSessionSurfaces.slice(firstIncludedIndex);
	currentIndex = sessionIds.length - 1;
	publish();
}

export function navigateSessionHistory(
	direction: SessionNavigationDirection,
): SessionNavigationTarget | null {
	const nextIndex: number = direction === "back" ? currentIndex - 1 : currentIndex + 1;
	const sessionId: string | undefined = sessionIds[nextIndex];
	const surface: SessionNavigationSurface | undefined = sessionSurfaces[nextIndex];
	if (sessionId === undefined || surface === undefined) {
		return null;
	}

	currentIndex = nextIndex;
	publish();
	return { sessionId, surface };
}

export function removeSessionFromNavigationHistory(sessionId: string): void {
	const nextSessionIds: string[] = sessionIds.filter((candidate: string): boolean => candidate !== sessionId);
	if (nextSessionIds.length === sessionIds.length) {
		return;
	}

	const removedBeforeCurrent: number = sessionIds.slice(0, Math.max(0, currentIndex + 1)).filter(
		(candidate: string): boolean => candidate === sessionId
	).length;
	const nextSessionSurfaces: SessionNavigationSurface[] = sessionSurfaces.filter(
		(_surface: SessionNavigationSurface, index: number): boolean =>
			sessionIds[index] !== sessionId,
	);
	sessionIds = nextSessionIds;
	sessionSurfaces = nextSessionSurfaces;
	currentIndex = sessionIds.length === 0
		? -1
		: Math.min(sessionIds.length - 1, Math.max(0, currentIndex - removedBeforeCurrent));
	publish();
}
