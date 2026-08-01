import type { SelectionAskMessage, SelectionAskThread } from "@/api/types";
import { Icon } from "@/assets/icons";
import { Alert, Button, Input, Modal, Space, Spin, Typography } from "antd";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MarkdownContent from "../markdown/MarkdownContent";
import styles from "./SelectionAskDialog.module.css";

export type SelectionAskDialogProps = {
	thread: SelectionAskThread | null;
	messages: SelectionAskMessage[];
	loading: boolean;
	sending: boolean;
	error: string | null;
	onClose: () => void;
	onSend: (message: string) => Promise<void>;
};

function SelectionAskDialog({ thread, messages, loading, sending, error, onClose, onSend }: SelectionAskDialogProps): React.JSX.Element {
	const { t } = useTranslation();
	const [draft, setDraft] = useState<string>("");
	const listRef = useRef<HTMLDivElement | null>(null);
	const activeMessages = useMemo(() => messages.filter((message: SelectionAskMessage): boolean => message.content.length > 0 || message.status !== "completed"), [messages]);

	useEffect((): void => setDraft(""), [thread?.threadId]);
	useEffect((): void => {
		const element: HTMLDivElement | null = listRef.current;
		if (element !== null) {
			element.scrollTop = element.scrollHeight;
		}
	}, [activeMessages]);

	const submit = (): void => {
		const message: string = draft.trim();
		if (message.length === 0 || sending) return;
		setDraft("");
		void onSend(message);
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
							<div key={message.messageId} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}>
								<MarkdownContent streaming={message.status === "running"}>{message.content}</MarkdownContent>
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
							disabled={sending}
							onChange={(event): void => setDraft(event.target.value)}
							onPressEnter={(event): void => {
								if (!event.nativeEvent.isComposing) submit();
							}}
						/>
						<Button type="primary" icon={sending ? <Spin size="small" /> : <Icon name="send" />} disabled={sending || draft.trim().length === 0} onClick={submit} aria-label={t("chat.selection.sendAsk")} />
					</Space.Compact>
				</div>
			)}
		</Modal>
	);
}

export default memo(SelectionAskDialog);
