import { Button, Input } from "antd";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { GitDiffReviewCommentTarget } from "./git-diff-review-comment-selection";
import styles from "./GitDiffReviewCommentEditor.module.css";

export type GitDiffReviewCommentEditorProps = {
	target: GitDiffReviewCommentTarget;
	onCancel: () => void;
	onSubmit: (comment: string) => void;
};

function GitDiffReviewCommentEditor({ target, onCancel, onSubmit }: GitDiffReviewCommentEditorProps): ReactElement {
	const { t } = useTranslation();
	const [comment, setComment] = useState<string>("");

	useEffect((): void => {
		setComment("");
	}, [target]);

	return (
		<div className={styles.editor}>
			<Input.TextArea
				autoFocus={true}
				aria-label={t("review.commentDialog.label")}
				placeholder={t("review.commentDialog.label")}
				value={comment}
				autoSize={{ minRows: 4, maxRows: 8 }}
				className={styles.input}
				maxLength={1200}
				onChange={(event): void => setComment(event.target.value)}
			/>
			<div className={styles.actions}>
				<Button onClick={onCancel}>{t("chat.user.actions.cancel")}</Button>
				<Button
					type="primary"
					disabled={comment.trim().length === 0}
					onClick={(): void => onSubmit(comment.trim())}
				>
					{t("review.commentDialog.submit")}
				</Button>
			</div>
		</div>
	);
}

export default GitDiffReviewCommentEditor;
