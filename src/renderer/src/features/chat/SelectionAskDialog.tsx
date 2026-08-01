import type { SelectionAskMessage, SelectionAskThread } from "@/api/types";
import { Icon } from "@/assets/icons";
import { Alert, Button, Input, Modal, Space, Spin, Tooltip, Typography } from "antd";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MarkdownContent from "../markdown/MarkdownContent";
import styles from "./SelectionAskDialog.module.css";

export type SelectionAskDialogProps = {
	thread: SelectionAskThread | null;
	messages: SelectionAskMessage[];
	loading: boolean;
	sending: boolean;
	cancelling: boolean;
	error: string | null;
	onClose: () => void;
	onSend: (message: string) => Promise<void>;
	onStop: () => Promise<void>;
};

function SelectionAskDialog({ thread, messages, loading, sending, cancelling, error, onClose, onSend, onStop }: SelectionAskDialogProps): React.JSX.Element {
	const { t } = useTranslation();
	const [draft, setDraft] = useState<string>("");
	const listRef = useRef<HTMLDivElement | null>(null);
	const messageItemsRef = useRef<HTMLDivElement | null>(null);
	const scrollAnchorModeRef = useRef<"bottom" | "latest-user" | null>(null);
	const scheduledScrollFrameRef = useRef<number | null>(null);
	const previousSendingRef = useRef<boolean>(sending);
	const activeThreadIdRef = useRef<string | null>(thread?.threadId ?? null);
	const activeMessages = useMemo(() => messages.filter((message: SelectionAskMessage): boolean => message.content.length > 0 || message.status !== "completed"), [messages]);
	const getDisplayContent = (message: SelectionAskMessage): string => {
		return message.role === "user" && message.sequence === 1
			? thread?.anchor.quote ?? message.content
			: message.content;
	};

	const cancelScheduledScroll = useCallback((): void => {
		if (scheduledScrollFrameRef.current === null) {
			return;
		}
		window.cancelAnimationFrame(scheduledScrollFrameRef.current);
		scheduledScrollFrameRef.current = null;
	}, []);

	const applyScrollAnchor = useCallback((): void => {
		const element: HTMLDivElement | null = listRef.current;
		const mode: "bottom" | "latest-user" | null = scrollAnchorModeRef.current;
		if (element === null || mode === null) {
			return;
		}

		if (mode === "bottom") {
			element.scrollTop = element.scrollHeight;
			return;
		}

		const userMessages: NodeListOf<HTMLElement> = element.querySelectorAll<HTMLElement>("[data-selection-ask-role='user']");
		const latestUserMessage: HTMLElement | undefined = userMessages[userMessages.length - 1];
		if (latestUserMessage === undefined) {
			element.scrollTop = element.scrollHeight;
			return;
		}
		const listRect: DOMRect = element.getBoundingClientRect();
		const messageRect: DOMRect = latestUserMessage.getBoundingClientRect();
		element.scrollTop = Math.max(0, element.scrollTop + messageRect.top - listRect.top - 8);
	}, []);

	const scheduleScrollAnchor = useCallback((): void => {
		if (scrollAnchorModeRef.current === null || scheduledScrollFrameRef.current !== null) {
			return;
		}
		scheduledScrollFrameRef.current = window.requestAnimationFrame((): void => {
			scheduledScrollFrameRef.current = null;
			applyScrollAnchor();
		});
	}, [applyScrollAnchor]);

	const releaseScrollAnchor = useCallback((): void => {
		scrollAnchorModeRef.current = null;
		cancelScheduledScroll();
	}, [cancelScheduledScroll]);

	useEffect((): void => setDraft(""), [thread?.threadId]);
	useLayoutEffect((): void => {
		const threadId: string | null = thread?.threadId ?? null;
		const threadChanged: boolean = activeThreadIdRef.current !== threadId;
		const sendingChanged: boolean = previousSendingRef.current !== sending;
		activeThreadIdRef.current = threadId;
		previousSendingRef.current = sending;

		if (threadChanged || sendingChanged) {
			scrollAnchorModeRef.current = sending ? "bottom" : "latest-user";
		}
		applyScrollAnchor();
	}, [activeMessages, applyScrollAnchor, sending, thread?.threadId]);

	useEffect((): (() => void) | void => {
		const messageItems: HTMLDivElement | null = messageItemsRef.current;
		if (messageItems === null) {
			return;
		}
		const resizeObserver = new ResizeObserver(scheduleScrollAnchor);
		resizeObserver.observe(messageItems);
		return (): void => {
			resizeObserver.disconnect();
			cancelScheduledScroll();
		};
	}, [cancelScheduledScroll, scheduleScrollAnchor, thread?.threadId]);

	const submit = (): void => {
		const message: string = draft.trim();
		if (message.length === 0 || sending) return;
		setDraft("");
		void onSend(message);
	};
	const handlePrimaryAction = (): void => {
		if (sending) {
			void onStop();
			return;
		}
		submit();
	};

	return (
		<Modal
			open={thread !== null}
			title={t("chat.selection.askTitle")}
			footer={null}
			width={680}
			centered={true}
			destroyOnHidden={true}
			mask={{ closable: true }}
			onCancel={onClose}
		>
			{thread === null ? null : (
				<div className={styles.shell}>
					<div className={styles.anchorHeader}>
						<Typography.Text ellipsis={{ tooltip: thread.anchor.quote }}>{thread.anchor.quote}</Typography.Text>
						<Typography.Text type="secondary">{thread.provider}/{thread.model}</Typography.Text>
					</div>
					<div
						ref={listRef}
						className={styles.messageList}
						onWheel={releaseScrollAnchor}
						onPointerDown={releaseScrollAnchor}
					>
						<div ref={messageItemsRef} className={styles.messageItems}>
							{loading && activeMessages.length === 0 ? <Spin className={styles.loading} /> : null}
							{activeMessages.map((message: SelectionAskMessage) => (
								<div
									key={message.messageId}
									className={message.role === "user" ? styles.userMessage : styles.assistantMessage}
									data-selection-ask-role={message.role}
								>
									{message.role === "user" ? (
										<div className={styles.userMessageText}>{getDisplayContent(message)}</div>
									) : (
										<div className={`${styles.messageContent} markdown-body`}>
											<MarkdownContent streaming={message.status === "running"}>{getDisplayContent(message)}</MarkdownContent>
										</div>
									)}
									{message.status === "running" && message.content.length === 0 ? <Spin size="small" /> : null}
									{message.status === "failed" || message.status === "interrupted" ? (
										<Typography.Text type="danger">
											{message.errorMessage ?? t(message.status === "interrupted" ? "chat.selection.interrupted" : "chat.selection.responseFailed")}
										</Typography.Text>
									) : null}
								</div>
							))}
						</div>
					</div>
					{error !== null ? <Alert type="error" showIcon={true} message={error} /> : null}
					<Space.Compact className={styles.composer}>
						<Input
							value={draft}
							placeholder={t("chat.selection.askPlaceholder")}
							disabled={sending || cancelling}
							onChange={(event): void => setDraft(event.target.value)}
							onPressEnter={(event): void => {
								if (!event.nativeEvent.isComposing) submit();
							}}
						/>
						<Tooltip title={t(cancelling ? "chat.selection.stoppingAsk" : sending ? "chat.selection.stopAsk" : "chat.selection.sendAsk")}>
							<Button
								type="primary"
								icon={<Icon name={sending ? "stop" : "send"} />}
								disabled={cancelling || (!sending && draft.trim().length === 0)}
								onClick={handlePrimaryAction}
								aria-label={t(cancelling ? "chat.selection.stoppingAsk" : sending ? "chat.selection.stopAsk" : "chat.selection.sendAsk")}
							/>
						</Tooltip>
					</Space.Compact>
				</div>
			)}
		</Modal>
	);
}

export default memo(SelectionAskDialog);
