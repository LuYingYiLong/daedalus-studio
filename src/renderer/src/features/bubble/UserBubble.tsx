import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./UserBubble.module.css";
import { Button, Input, Typography } from "antd";
import { Icon } from "@/assets/icons";
import type { AdditionalContextItem } from "@/api/types";
import AdditionalContextStrip from "./AdditionalContextStrip";

export type RetryUserMessagePayload = {
	requestId: string;
	message: string;
	additionalContext: AdditionalContextItem[];
};

export type UserBubbleProps = {
	entryId?: string;
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
};

function cloneContextItems(items: AdditionalContextItem[]): AdditionalContextItem[] {
	return items.map((item: AdditionalContextItem): AdditionalContextItem => {
		return {
			...item,
			data: typeof structuredClone === "function" ? structuredClone(item.data) as unknown : item.data
		};
	});
}

function UserBubble({
	entryId,
	requestId,
	message,
	additionalContext = [],
	sentTime,
	showEditButton,
	disabled = false,
	isRetryEditing = false,
	onRetryEditStart,
	onRetryEditCancel,
	onRetryFromUserMessage
}: UserBubbleProps): React.JSX.Element {
	const [draftText, setDraftText] = useState<string>(message);
	const [draftContext, setDraftContext] = useState<AdditionalContextItem[]>(() => cloneContextItems(additionalContext));
	const [isSubmittingRetry, setIsSubmittingRetry] = useState<boolean>(false);

	useEffect((): void => {
		if (!isRetryEditing) {
			setDraftText(message);
			setDraftContext(cloneContextItems(additionalContext));
			setIsSubmittingRetry(false);
			return;
		}

		setDraftText(message);
		setDraftContext(cloneContextItems(additionalContext));
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
		if (trimmedText.length === 0 || isSubmittingRetry) {
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

	return (
		<article className={styles.root} data-entry-id={entryId}>
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
								Cancel
							</Button>
							<Button
								type="primary"
								icon={<Icon name="send" width={16} height={16} />}
								loading={isSubmittingRetry}
								disabled={draftText.trim().length === 0}
								onClick={(): void => {
									void submitRetryEdit();
								}}
							>
								Send
							</Button>
						</div>
					</div>
				) : (
					<>
						<AdditionalContextStrip items={additionalContext} />
						<div
							className={`${styles.content} markdown-body ${disabled ? styles.disabledContent : ""}`}
							onDoubleClick={(): void => {
								beginRetryEdit();
							}}
						>
							<Markdown remarkPlugins={[remarkGfm]}>
								{message}
							</Markdown>
						</div>
					</>
				)}
			</div>
			<div className={styles.toolbar}>
				{sentTime ? (
					<Typography.Text type="secondary">{sentTime}</Typography.Text>
				) : null}
				<Button
					type="text"
					size="small"
					icon={<Icon name="copy" />}
				/>
				{showEditButton ? (
					<Button
						type="text"
						size="small"
						icon={<Icon name="edit" />}
						disabled={disabled}
						onClick={() => {
							beginRetryEdit();
						}}
					/>
				) : null}
			</div>
		</article>
	);
}

export default UserBubble;
