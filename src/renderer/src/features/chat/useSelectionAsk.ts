import type { MessageTextAnchor, SelectionAskMessage, SelectionAskThread, SelectionAskThreadPage } from "@/api/types";
import { createSelectionAskThread, getSelectionAskThread, listSelectionAskThreads, sendSelectionAskMessage } from "@/api/session-api";
import { createBackendClient } from "@/shared/api/transport/backend-client";
import type { BackendEvent } from "@/shared/api/transport/backend-rpc-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getMessageAnchorKey } from "./message-text-anchor";

type SelectionAskState = {
	threads: SelectionAskThread[];
	messagesByThread: Record<string, SelectionAskMessage[]>;
	activeThreadId: string | null;
	loading: boolean;
	sending: boolean;
	error: string | null;
};

function mergeMessages(current: readonly SelectionAskMessage[], incoming: readonly SelectionAskMessage[]): SelectionAskMessage[] {
	const byId = new Map(current.map((message: SelectionAskMessage): [string, SelectionAskMessage] => [message.messageId, message]));
	for (const message of incoming) {
		byId.set(message.messageId, { ...byId.get(message.messageId), ...message });
	}
	return [...byId.values()].sort((left: SelectionAskMessage, right: SelectionAskMessage): number => left.sequence - right.sequence);
}

function getEventData(event: BackendEvent): Record<string, unknown> | null {
	return typeof event.data === "object" && event.data !== null && !Array.isArray(event.data)
		? event.data as Record<string, unknown>
		: null;
}

export function useSelectionAsk(sessionId: string, initialThreads: SelectionAskThread[] = []): SelectionAskState & {
	close: () => void;
	createOrOpen: (anchor: MessageTextAnchor, locale: "zh-CN" | "en-US") => Promise<void>;
	open: (threadId: string) => Promise<void>;
	send: (message: string) => Promise<void>;
} {
	const [state, setState] = useState<SelectionAskState>({
		threads: initialThreads, messagesByThread: {}, activeThreadId: null, loading: initialThreads.length === 0, sending: false, error: null
	});
	const stateRef = useRef<SelectionAskState>(state);
	stateRef.current = state;

	const applyPage = useCallback((page: SelectionAskThreadPage): void => {
		setState((current: SelectionAskState): SelectionAskState => ({
			...current,
			threads: [page.thread, ...current.threads.filter((thread: SelectionAskThread): boolean => thread.threadId !== page.thread.threadId)],
			messagesByThread: {
				...current.messagesByThread,
				[page.thread.threadId]: mergeMessages(current.messagesByThread[page.thread.threadId] ?? [], page.messages)
			},
			activeThreadId: page.thread.threadId,
			loading: false,
			error: null
		}));
	}, []);

	useEffect((): (() => void) => {
		let disposed: boolean = false;
		let unsubscribe: (() => void) | null = null;
		setState({ threads: initialThreads, messagesByThread: {}, activeThreadId: null, loading: initialThreads.length === 0, sending: false, error: null });
		void listSelectionAskThreads(sessionId).then((result): void => {
			if (!disposed) {
				setState((current: SelectionAskState): SelectionAskState => {
					const listedIds = new Set(result.threads.map((thread: SelectionAskThread): string => thread.threadId));
					return {
						...current,
						threads: [...result.threads, ...current.threads.filter((thread: SelectionAskThread): boolean => !listedIds.has(thread.threadId))],
						loading: false
					};
				});
			}
		}).catch((error: unknown): void => {
			if (!disposed) {
				setState((current: SelectionAskState): SelectionAskState => ({ ...current, loading: false, error: error instanceof Error ? error.message : String(error) }));
			}
		});
		void createBackendClient().then((client): void => {
			if (disposed) {
				return;
			}
			unsubscribe = client.addEventListener((event: BackendEvent): void => {
				if (event.sessionId !== sessionId || !event.event.startsWith("session.selectionAsk.message.")) {
					return;
				}
				const data = getEventData(event);
				const threadId: string = typeof data?.threadId === "string" ? data.threadId : "";
				const messageId: string = typeof data?.messageId === "string" ? data.messageId : "";
				if (threadId.length === 0 || messageId.length === 0) {
					return;
				}
				setState((current: SelectionAskState): SelectionAskState => {
					const messages: SelectionAskMessage[] = [...(current.messagesByThread[threadId] ?? [])];
					const index: number = messages.findIndex((message: SelectionAskMessage): boolean => message.messageId === messageId);
					if (index < 0) {
						return current;
					}
					const previous = messages[index] as SelectionAskMessage;
					if (event.event.endsWith(".delta")) {
						messages[index] = { ...previous, content: previous.content + (typeof data?.text === "string" ? data.text : ""), status: "running" };
					} else if (event.event.endsWith(".done")) {
						messages[index] = { ...previous, content: typeof data?.content === "string" ? data.content : previous.content, status: "completed" };
					} else {
						messages[index] = {
							...previous,
							content: typeof data?.partialContent === "string" ? data.partialContent : previous.content,
							status: "failed",
							errorMessage: typeof data?.message === "string" ? data.message : previous.errorMessage
						};
					}
					const nextStatus: SelectionAskThread["status"] = event.event.endsWith(".done")
						? "idle"
						: event.event.endsWith(".error") ? "failed" : "running";
					return {
						...current,
						threads: current.threads.map((thread: SelectionAskThread): SelectionAskThread => thread.threadId === threadId
							? { ...thread, status: nextStatus }
							: thread),
						messagesByThread: { ...current.messagesByThread, [threadId]: messages },
						sending: event.event.endsWith(".delta"),
						error: event.event.endsWith(".error") && typeof data?.message === "string" ? data.message : current.error
					};
				});
			});
		});
		return (): void => {
			disposed = true;
			unsubscribe?.();
		};
	}, [initialThreads, sessionId]);

	const open = useCallback(async (threadId: string): Promise<void> => {
		setState((current: SelectionAskState): SelectionAskState => ({ ...current, activeThreadId: threadId, loading: true, error: null }));
		try {
			applyPage(await getSelectionAskThread(sessionId, threadId));
		} catch (error: unknown) {
			setState((current: SelectionAskState): SelectionAskState => ({ ...current, loading: false, error: error instanceof Error ? error.message : String(error) }));
		}
	}, [applyPage, sessionId]);

	const createOrOpen = useCallback(async (anchor: MessageTextAnchor, locale: "zh-CN" | "en-US"): Promise<void> => {
		const existing: SelectionAskThread | undefined = stateRef.current.threads.find((thread: SelectionAskThread): boolean => getMessageAnchorKey(thread.anchor) === getMessageAnchorKey(anchor));
		if (existing !== undefined) {
			await open(existing.threadId);
			return;
		}
		setState((current: SelectionAskState): SelectionAskState => ({ ...current, loading: true, sending: true, error: null }));
		try {
			applyPage(await createSelectionAskThread(sessionId, anchor, locale));
		} catch (error: unknown) {
			setState((current: SelectionAskState): SelectionAskState => ({ ...current, loading: false, sending: false, error: error instanceof Error ? error.message : String(error) }));
			throw error;
		}
	}, [applyPage, open, sessionId]);

	const send = useCallback(async (message: string): Promise<void> => {
		const threadId: string | null = stateRef.current.activeThreadId;
		if (threadId === null || message.trim().length === 0 || stateRef.current.sending) {
			return;
		}
		setState((current: SelectionAskState): SelectionAskState => ({ ...current, sending: true, error: null }));
		try {
			const result = await sendSelectionAskMessage(sessionId, threadId, message.trim());
			setState((current: SelectionAskState): SelectionAskState => ({
				...current,
				threads: [result.thread, ...current.threads.filter((thread: SelectionAskThread): boolean => thread.threadId !== threadId)],
				messagesByThread: { ...current.messagesByThread, [threadId]: mergeMessages(current.messagesByThread[threadId] ?? [], result.messages) }
			}));
		} catch (error: unknown) {
			setState((current: SelectionAskState): SelectionAskState => ({ ...current, sending: false, error: error instanceof Error ? error.message : String(error) }));
		}
	}, [sessionId]);

	return {
		...state,
		close: (): void => setState((current: SelectionAskState): SelectionAskState => ({ ...current, activeThreadId: null })),
		createOrOpen,
		open,
		send
	};
}
