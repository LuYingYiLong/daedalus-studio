import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { ConversationTimelinePaneHandle } from "@/widgets/conversation/ConversationTimelinePane";
import {
	detectShortcutPlatform,
	findMatchingShortcutCommand,
	type KeyboardShortcutOverrides,
	type ShortcutCommandId,
	type ShortcutPlatform,
} from "@/platform/rpc/keyboard-shortcuts";
import {
	navigateSessionHistory,
	SESSION_NAVIGATION_EVENT,
} from "@/domain/session/session-navigation-history";

const MAX_SELECTED_SEARCH_QUERY_LENGTH: number = 500;

export function getSelectedConversationSearchQuery(
	container: HTMLElement | null,
): string | undefined {
	const selection: Selection | null = window.getSelection();
	if (
		container === null ||
		selection === null ||
		selection.isCollapsed ||
		selection.rangeCount === 0 ||
		selection.anchorNode === null ||
		selection.focusNode === null ||
		!container.contains(selection.anchorNode) ||
		!container.contains(selection.focusNode)
	) {
		return undefined;
	}
	const anchorElement: Element | null =
		selection.anchorNode instanceof Element
			? selection.anchorNode
			: selection.anchorNode.parentElement;
	const focusElement: Element | null =
		selection.focusNode instanceof Element
			? selection.focusNode
			: selection.focusNode.parentElement;
	if (
		anchorElement === null ||
		focusElement === null ||
		anchorElement.closest('[data-chat-search-text="true"]') === null ||
		focusElement.closest('[data-chat-search-text="true"]') === null ||
		anchorElement.closest("[data-chat-search-ignore]") !== null ||
		focusElement.closest("[data-chat-search-ignore]") !== null
	) {
		return undefined;
	}
	const selectedText: string = selection.toString().trim();
	return selectedText.length > 0 &&
		selectedText.length <= MAX_SELECTED_SEARCH_QUERY_LENGTH &&
		!/[\r\n]/u.test(selectedText)
		? selectedText
		: undefined;
}

export function shouldIgnoreGlobalShortcut(event: KeyboardEvent): boolean {
	if (event.isComposing) {
		return true;
	}
	const target: EventTarget | null = event.target;
	if (!(target instanceof Element)) {
		return false;
	}
	return (
		target.closest(
			[
				"input",
				"textarea",
				"select",
				"[contenteditable='true']",
				"[contenteditable='']",
				"[role='textbox']",
				"[role='combobox']",
				"[role='dialog']",
				"[role='menu']",
				"[role='listbox']",
			].join(","),
		) !== null
	);
}

export type HomePageKeyboardShortcutsParams = {
	keyboardShortcuts: KeyboardShortcutOverrides;
	activeSessionId: string | null;
	isHome: boolean;
	timelineNavigationEntriesLength: number;
	conversationTimelinePaneRef: MutableRefObject<ConversationTimelinePaneHandle | null>;
	chatBodyRef: MutableRefObject<HTMLDivElement | null>;
	showBottomDockButton: boolean;
	showSideDockButton: boolean;
	toggleWorkspaceSidebar: () => void;
	toggleBottomDock: () => void;
	toggleSideDock: () => void;
	requestNewSessionSurface: () => void;
};

export default function useHomePageKeyboardShortcuts({
	keyboardShortcuts,
	activeSessionId,
	isHome,
	timelineNavigationEntriesLength,
	conversationTimelinePaneRef,
	chatBodyRef,
	showBottomDockButton,
	showSideDockButton,
	toggleWorkspaceSidebar,
	toggleBottomDock,
	toggleSideDock,
	requestNewSessionSurface,
}: HomePageKeyboardShortcutsParams): void {
	useEffect((): (() => void) => {
		const platform: ShortcutPlatform = detectShortcutPlatform();
		const handleGlobalShortcut = (event: KeyboardEvent): void => {
			if (event.defaultPrevented) {
				return;
			}
			if (
				event.key === "Escape" &&
				conversationTimelinePaneRef.current?.closeSearch() === true
			) {
				event.preventDefault();
				return;
			}
			if (shouldIgnoreGlobalShortcut(event)) {
				return;
			}
			const commandId: ShortcutCommandId | null =
				findMatchingShortcutCommand(event, keyboardShortcuts, platform);
			if (commandId === null || event.repeat) {
				return;
			}
			if (commandId === "workbench.toggleWorkspaceSidebar") {
				event.preventDefault();
				toggleWorkspaceSidebar();
				return;
			}
			if (commandId === "workbench.toggleBottomPanel") {
				if (!showBottomDockButton) {
					return;
				}
				event.preventDefault();
				toggleBottomDock();
				return;
			}
			if (commandId === "workbench.toggleSessionSidebar") {
				if (activeSessionId === null || !showSideDockButton) {
					return;
				}
				event.preventDefault();
				toggleSideDock();
				return;
			}
			if (commandId === "session.new") {
				event.preventDefault();
				requestNewSessionSurface();
				return;
			}
			if (
				commandId === "session.previous" ||
				commandId === "session.next"
			) {
				event.preventDefault();
				const sessionId: string | null = navigateSessionHistory(
					commandId === "session.previous" ? "back" : "forward",
				);
				if (sessionId === null) {
					return;
				}
				window.dispatchEvent(
					new CustomEvent<string>(SESSION_NAVIGATION_EVENT, {
						detail: sessionId,
					}),
				);
				return;
			}
			if (activeSessionId === null || isHome) {
				return;
			}
			if (commandId === "conversation.find") {
				event.preventDefault();
				conversationTimelinePaneRef.current?.openSearch(
					getSelectedConversationSearchQuery(chatBodyRef.current),
				);
				return;
			}
			if (timelineNavigationEntriesLength === 0) {
				return;
			}
			event.preventDefault();
			conversationTimelinePaneRef.current?.navigateTurn(
				commandId === "conversation.previousTurn" ? "previous" : "next",
			);
		};
		window.addEventListener("keydown", handleGlobalShortcut);
		return (): void => {
			window.removeEventListener("keydown", handleGlobalShortcut);
		};
	}, [
		activeSessionId,
		chatBodyRef,
		conversationTimelinePaneRef,
		isHome,
		keyboardShortcuts,
		requestNewSessionSurface,
		showBottomDockButton,
		showSideDockButton,
		timelineNavigationEntriesLength,
		toggleBottomDock,
		toggleSideDock,
		toggleWorkspaceSidebar,
	]);
}
