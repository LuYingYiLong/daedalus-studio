import { useState } from "react";
import { Alert, Button, Input, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { TimelineBodyPart } from "@/platform/rpc/types";
import { answerAgentClarification } from "@/platform/rpc/agent-clarification-api";
import ClarificationChoices from "./ClarificationChoices";
import styles from "./AgentClarificationCard.module.css";

type Part = Extract<TimelineBodyPart, { type: "agent_clarification" }>;

export default function AgentClarificationCard({ part }: { part: Part }): React.JSX.Element {
	const { t } = useTranslation();
	const [customReply, setCustomReply] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function submit(answer: string): Promise<void> {
		const trimmed = answer.trim();
		if (!trimmed || submitting || part.status !== "pending") return;
		setSubmitting(true);
		setError(null);
		try {
			await answerAgentClarification(part.sessionId, part.questionId, trimmed);
		} catch (cause: unknown) {
			setError(cause instanceof Error ? cause.message : t("agentClarification.submitFailed"));
		} finally {
			setSubmitting(false);
		}
	}
	return (
		<section
			id={`agent-question-${part.questionId}`}
			className={styles.body}
			aria-label={t("agentClarification.title")}
		>
			<Typography.Text type={part.status === "pending" ? "secondary" : undefined}>
				{part.question}
			</Typography.Text>
			{part.status === "pending" ? (
				<>
					<ClarificationChoices
						choices={part.choices}
						disabled={submitting}
						maxChoices={5}
						onChoose={(answer): void => {
							void submit(answer);
						}}
					/>
					<div className={styles.customReplyRow}>
						<Input.TextArea
							value={customReply}
							autoSize={{ minRows: 1, maxRows: 1 }}
							maxLength={4000}
							placeholder={t("agentClarification.placeholder")}
							disabled={submitting}
							onChange={(event): void => setCustomReply(event.target.value)}
						/>
						<Button
							type="primary"
							block
							loading={submitting}
							disabled={!customReply.trim()}
							onClick={(): void => {
								void submit(customReply);
							}}
						>
							{t("agentClarification.submit")}
						</Button>
					</div>
				</>
			) : (
				<Typography.Text type="secondary">
					{part.status === "cancelled"
						? t("agentClarification.cancelled")
						: `${t("agentClarification.answered")}: ${part.answer ?? ""}`}
				</Typography.Text>
			)}
			{error ? <Alert type="error" title={error} /> : null}
		</section>
	);
}
