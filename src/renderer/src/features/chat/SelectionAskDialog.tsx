import type { SelectionAskMessage, SelectionAskThread } from "@/api/types";
import { Icon } from "@/assets/icons";
import { Alert, Button, Input, Modal, Space, Spin, Tooltip, Typography } from "antd";
import { memo, useEffect, useMemo, useRef, useState } from "react";
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
	const activeMessages = useMemo(() => messages.filter((message: SelectionAskMessage): boolean => message.content.length > 0 || message.status !== "completed"), [messages]);
	const getDisplayContent = (message: SelectionAskMessage): string => {
		return message.role === "user" && message.sequence === 1
			? thread?.anchor.quote ?? message.content
			: message.content;
	};

	useEffect((): void => setDraft(""), [thread?.threadId]);
	useEffect((): (() => void) | void => {
		const element: HTMLDivElement | null = listRef.current;
		if (element === null) {
			return;
		}

		let settleFrame: number | null = null;
		const layoutFrame: number = window.requestAnimationFrame((): void => {
			if (sending) {
				element.scrollTop = element.scrollHeight;
				return;
			}

			// MarkdownContent commits its final, non-streaming source in a passive
			// effect. Wait one more frame before restoring the latest question.
			settleFrame = window.requestAnimationFrame((): void => {
				const userMessages: NodeListOf<HTMLElement> = element.querySelectorAll<HTMLElement>("[data-selection-ask-role='user']");
				const latestUserMessage: HTMLElement | undefined = userMessages[userMessages.length - 1];
				if (latestUserMessage === undefined) {
					element.scrollTop = element.scrollHeight;
					return;
				}
				const listRect: DOMRect = element.getBoundingClientRect();
				const messageRect: DOMRect = latestUserMessage.getBoundingClientRect();
				element.scrollTop = Math.max(0, element.scrollTop + messageRect.top - listRect.top - 8);
			});
		});

		return (): void => {
			window.cancelAnimationFrame(layoutFrame);
			if (settleFrame !== null) {
				window.cancelAnimationFrame(settleFrame);
			}
		};
	}, [activeMessages, sending]);

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
					<div ref={listRef} className={styles.messageList}>
						{loading && activeMessages.length === 0 ? <Spin className={styles.loading} /> : null}
						{activeMessages.map((message: SelectionAskMessage) => (
							<div
								key={message.messageId}
								className={message.role === "user" ? styles.userMessage : styles.assistantMessage}
								data-selection-ask-role={message.role}
							>
								<div className={`${styles.messageContent} markdown-body`}>
									<MarkdownContent streaming={message.status === "running"}>{getDisplayContent(message)}</MarkdownContent>
								</div>
								{message.status === "running" && message.content.length === 0 ? <Spin size="small" /> : null}
								{message.status === "failed" || message.status === "interrupted" ? (
									<Typography.Text type="danger">
										{message.errorMessage ?? t(message.status === "interrupted" ? "chat.selection.interrupted" : "chat.selection.responseFailed")}
									</Typography.Text>
								) : null}
							</div>
						))}
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
