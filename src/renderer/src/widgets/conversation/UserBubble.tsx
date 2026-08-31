import { memo, useEffect, useRef, useState } from "react";
import styles from "./UserBubble.module.css";
import { Button, Input, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { AdditionalContextItem } from "@/platform/rpc/types";
import AdditionalContextStrip from "./AdditionalContextStrip";
import { copyTextToClipboard } from "@/platform/electron/clipboard";
import MarkdownContent from "../markdown/MarkdownContent";
import type { RetryUserMessagePayload } from "@/domain/conversation/retry-user-message";
export type { RetryUserMessagePayload } from "@/domain/conversation/retry-user-message";

export type UserBubbleProps = {
	entryId?: string;
	searchBlockOffset?: number;
	requestId: string;
	message: string;
	additionalContext?: AdditionalContextItem[];
	sentTime?: string;
	showEditButton?: boolean;
	disabled?: boolean;
	isRetryEditing?: boolean;
	onRetryEditStart?: (requestId: string) => void;
	onRetryEditCancel?: (requestId: string) => void;
	onRetryFromUserMessage?: (payload: RetryUserMessagePayload) => boolean | void | Promise<boolean | void>;
	onForkFromUserMessage?: (requestId: string) => void | Promise<void>;
	forkDisabled?: boolean;
	isForking?: boolean;
};

function cloneContextItems(items: AdditionalContextItem[]): AdditionalContextItem[] {
	return items.map((item: AdditionalContextItem): AdditionalContextItem => {
		return {
			...item,
			data: typeof structuredClone === "function" ? structuredClone(item.data) as unknown : item.data
		};
	});
}

const EMPTY_ADDITIONAL_CONTEXT: AdditionalContextItem[] = [];

function UserBubble({
	entryId,
	searchBlockOffset,
	requestId,
	message,
	additionalContext = EMPTY_ADDITIONAL_CONTEXT,
	sentTime,
	showEditButton,
	disabled = false,
	isRetryEditing = false,
	onRetryEditStart,
	onRetryEditCancel,
	onRetryFromUserMessage,
	onForkFromUserMessage,
	forkDisabled = false,
	isForking = false
}: UserBubbleProps): React.JSX.Element {
	const { t } = useTranslation();
	const [draftText, setDraftText] = useState<string>(message);
	const [draftContext, setDraftContext] = useState<AdditionalContextItem[]>(() => cloneContextItems(additionalContext));
	const [isSubmittingRetry, setIsSubmittingRetry] = useState<boolean>(false);
	const [copied, setCopied] = useState<boolean>(false);
	const wasRetryEditingRef = useRef<boolean>(isRetryEditing);

	useEffect((): void => {
		const wasRetryEditing: boolean = wasRetryEditingRef.current;
		wasRetryEditingRef.current = isRetryEditing;

		if (!isRetryEditing) {
			if (wasRetryEditing) {
				setDraftText(message);
				setDraftContext(cloneContextItems(additionalContext));
				setIsSubmittingRetry(false);
			}
			return;
		}

		if (!wasRetryEditing) {
			setDraftText(message);
			setDraftContext(cloneContextItems(additionalContext));
		}
	}, [additionalContext, isRetryEditing, message]);

	function beginRetryEdit(): void {
		if (disabled || isSubmittingRetry) {
			return;
		}

		setDraftText(message);
		setDraftContext(cloneContextItems(additionalContext));
		onRetryEditStart?.(requestId);
	}

	function cancelRetryEdit(): void {
		if (isSubmittingRetry) {
			return;
		}

		onRetryEditCancel?.(requestId);
		setDraftText(message);
		setDraftContext(cloneContextItems(additionalContext));
	}

	async function submitRetryEdit(): Promise<void> {
		const trimmedText: string = draftText.trim();
		if ((trimmedText.length === 0 && draftContext.length === 0) || isSubmittingRetry) {
			return;
		}

		setIsSubmittingRetry(true);
		try {
			const result = await onRetryFromUserMessage?.({
				requestId,
				message: trimmedText,
				additionalContext: cloneContextItems(draftContext)
			});

			if (result !== false) {
				onRetryEditCancel?.(requestId);
			}
		} finally {
			setIsSubmittingRetry(false);
		}
	}

	function toggleDraftContextPin(contextId: string, pinned: boolean): void {
		setDraftContext((currentItems: AdditionalContextItem[]): AdditionalContextItem[] => {
			return currentItems.map((item: AdditionalContextItem): AdditionalContextItem => {
				return item.id === contextId ? { ...item, pinned } : item;
			});
		});
	}

	function removeDraftContext(contextId: string): void {
		setDraftContext((currentItems: AdditionalContextItem[]): AdditionalContextItem[] => {
			return currentItems.filter((item: AdditionalContextItem): boolean => item.id !== contextId);
		});
	}

	async function copyMessage(): Promise<void> {
		try {
			await copyTextToClipboard(message);
			setCopied(true);
			window.setTimeout((): void => setCopied(false), 1200);
		} catch (error: unknown) {
			console.error("[UserBubble] copy failed", error);
		}
	}

	async function forkMessage(): Promise<void> {
		if (forkDisabled || isForking || onForkFromUserMessage === undefined) {
			return;
		}
		await onForkFromUserMessage(requestId);
	}

	const canShowEditButton: boolean = showEditButton === true && !isRetryEditing;

	return (
		<article id={entryId} className={styles.root} data-entry-id={entryId} data-entry-kind="user">
			<div className={styles.bubbleStack}>
				{isRetryEditing ? (
					<div className={styles.retryComposer}>
						{draftContext.length > 0 ? (
							<div className={styles.retryContextArea}>
								<AdditionalContextStrip
									items={draftContext}
									align="start"
									interactive={true}
									onTogglePin={toggleDraftContextPin}
									onRemove={removeDraftContext}
								/>
							</div>
						) : null}
						<Input.TextArea
							value={draftText}
							autoFocus={true}
							autoSize={{ minRows: draftContext.length > 0 ? 2 : 3, maxRows: 10 }}
							className={styles.retryTextArea}
							onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void => {
								setDraftText(event.target.value);
							}}
							onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
								if (event.key === "Escape") {
									event.preventDefault();
									cancelRetryEdit();
									return;
								}

								if (event.key !== "Enter" || event.shiftKey) {
									return;
								}

								event.preventDefault();
								void submitRetryEdit();
							}}
						/>
						<div className={styles.retryToolbar}>
							<Button
								type="text"
								onClick={cancelRetryEdit}
								disabled={isSubmittingRetry}
							>
								{t("chat.user.actions.cancel")}
							</Button>
							<Button
								type="primary"
								icon={<Icon name="send" width={16} height={16} />}
								loading={isSubmittingRetry}
								disabled={draftText.trim().length === 0 && draftContext.length === 0}
								onClick={(): void => {
									void submitRetryEdit();
								}}
							>
								{t("chat.user.actions.send")}
							</Button>
						</div>
					</div>
				) : (
					<>
						<AdditionalContextStrip items={additionalContext} />
						{message.length > 0 ? <div
							className={`${styles.content} markdown-body ${disabled ? styles.disabledContent : ""}`}
							data-chat-search-text="true"
							data-chat-search-block-offset={searchBlockOffset}
							data-message-selection-enabled="true"
							data-message-selection-entry-id={entryId}
							data-message-selection-request-id={requestId}
							data-message-selection-role="user"
							data-message-selection-segment="user:content"
							onDoubleClick={(): void => {
								beginRetryEdit();
							}}
						>
							<MarkdownContent>{message}</MarkdownContent>
						</div> : null}
					</>
				)}
			</div>
			<div className={styles.toolbar}>
				{sentTime ? (
					<Typography.Text type="secondary">{sentTime}</Typography.Text>
				) : null}
				{message.length > 0 ? <Tooltip title={copied ? t("chat.common.copied") : t("chat.common.copy")}>
					<Button
						type="text"
						size="small"
						shape="circle"
						aria-label={t("chat.user.copyAria")}
						icon={<Icon name="copy" />}
						onClick={(): void => {
							void copyMessage();
						}}
					/>
				</Tooltip> : null}
				{onForkFromUserMessage !== undefined ? (
					<Tooltip title={t("chat.user.actions.forkFromHere")}>
						<Button
							type="text"
							size="small"
							shape="circle"
							aria-label={t("chat.user.forkAria")}
							icon={<Icon name="fork" />}
							loading={isForking}
							disabled={forkDisabled}
							onClick={(): void => {
								void forkMessage();
							}}
						/>
					</Tooltip>
				) : null}
				{canShowEditButton ? (
					<Tooltip title={t("chat.user.actions.editAndResend")}>
						<Button
							type="text"
							size="small"
							shape="circle"
							aria-label={t("chat.user.editAndResendAria")}
							icon={<Icon name="pencil" />}
							disabled={disabled || isSubmittingRetry}
							onClick={beginRetryEdit}
						/>
					</Tooltip>
				) : null}
			</div>
		</article>
	);
}

export default memo(UserBubble);
