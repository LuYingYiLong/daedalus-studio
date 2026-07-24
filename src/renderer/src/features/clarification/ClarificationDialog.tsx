import { useEffect, useState } from "react";
import { Button, Input, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { PlanRecommendedReply } from "@/api/types";
import styles from "./ClarificationDialog.module.css";

export type ClarificationDialogProps = {
	planId: string;
	title: string;
	question: string;
	recommendedReplies: PlanRecommendedReply[];
	isSubmitting: boolean;
	errorMessage: string | null;
	onSubmit: (reply: string) => void;
	onSkip: () => void;
};

function ClarificationDialog({
	planId,
	title,
	question,
	recommendedReplies,
	isSubmitting,
	errorMessage,
	onSubmit,
	onSkip
}: ClarificationDialogProps): React.JSX.Element {
	const { t } = useTranslation();
	const [customReply, setCustomReply] = useState<string>("");

	useEffect((): void => {
		setCustomReply("");
	}, [planId, question]);

	const trimmedReply: string = customReply.trim();

	return (
		<section className={styles.clarificationDialog} aria-label={t("clarification.aria")}>
			<header className={styles.header}>
				<div className={styles.heading}>
					<Typography.Title level={4} className={styles.title}>
						{t("clarification.title")}
					</Typography.Title>
				</div>
			</header>

			<Typography.Paragraph className={styles.question}>
				{question}
			</Typography.Paragraph>

			{recommendedReplies.length > 0 ? (
				<div className={styles.suggestedReplies}>
					{recommendedReplies.slice(0, 3).map((reply: PlanRecommendedReply, index: number): React.JSX.Element => (
						<Button
							key={`${reply.label}:${index.toString()}`}
							block={true}
							type={index === 0 ? "primary" : "default"}
							className={styles.suggestedReplyButton}
							disabled={isSubmitting}
							onClick={(): void => onSubmit(reply.text)}
						>
							<span className={styles.replyContent}>
								<span className={styles.replyLabel}>
									{reply.label}{index === 0 ? ` ${t("clarification.recommendedSuffix")}` : ""}
								</span>
								{reply.description ? (
									<span className={styles.replyDescription}>{reply.description}</span>
								) : null}
							</span>
						</Button>
					))}
				</div>
			) : null}

			<Space.Compact className={styles.customReplyRow}>
				<Input
					value={customReply}
					placeholder={t("clarification.placeholder")}
					className={styles.customReplyInput}
					disabled={isSubmitting}
					onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
						setCustomReply(event.target.value);
					}}
				/>
				<Button disabled={isSubmitting} onClick={onSkip}>
					{t("clarification.actions.skip")}
				</Button>
				<Button
					type="primary"
					loading={isSubmitting}
					disabled={trimmedReply.length === 0}
					onClick={(): void => onSubmit(trimmedReply)}
				>
					{t("clarification.actions.submit")}
				</Button>
			</Space.Compact>

			{errorMessage ? (
				<Typography.Text type="danger" className={styles.errorText}>
					{errorMessage}
				</Typography.Text>
			) : null}
		</section>
	);
}

export default ClarificationDialog;
