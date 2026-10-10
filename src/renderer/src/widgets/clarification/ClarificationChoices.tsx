import { Button } from "antd";
import styles from "./ClarificationChoices.module.css";

export type ClarificationChoice = { label: string; text: string; description?: string };

export default function ClarificationChoices({
	choices,
	disabled,
	maxChoices,
	onChoose,
	recommendedSuffix,
}: {
	choices: readonly ClarificationChoice[];
	disabled: boolean;
	maxChoices: number;
	onChoose: (answer: string) => void;
	recommendedSuffix?: string;
}): React.JSX.Element | null {
	if (choices.length === 0) return null;
	return (
		<div className={styles.suggestedReplies}>
			{choices.slice(0, maxChoices).map(
				(choice, index): React.JSX.Element => (
					<Button
						key={`${choice.label}:${index}`}
						block
						type={index === 0 ? "primary" : "default"}
						className={styles.suggestedReplyButton}
						disabled={disabled}
						onClick={(): void => onChoose(choice.text)}
					>
						<span className={styles.replyContent}>
							<span className={styles.replyLabel}>
								{choice.label}
								{index === 0 && recommendedSuffix ? ` ${recommendedSuffix}` : ""}
							</span>
							{choice.description ? (
								<span className={styles.replyDescription}>{choice.description}</span>
							) : null}
						</span>
					</Button>
				),
			)}
		</div>
	);
}
