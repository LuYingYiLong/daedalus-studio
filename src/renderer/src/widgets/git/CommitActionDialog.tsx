import type { ChangeEvent, JSX } from "react";
import { Alert, Button, Checkbox, Input, Modal, Space } from "antd";
import { useTranslation } from "react-i18next";
import type { CommitActionDialogProps } from "@/features/git/dialog-types";
import styles from "./GitActionDialog.module.css";

function CommitActionDialog({
	open,
	commitMessage,
	includeUnstagedChanges,
	commitOperation,
	isCommitMessageGenerating,
	errorMessage,
	hasWorkspace,
	onCancel,
	onCommitMessageChange,
	onIncludeUnstagedChangesChange,
	onCommitAction
}: CommitActionDialogProps): JSX.Element {
	const { t } = useTranslation();
	const isCommitOperationRunning: boolean = commitOperation !== null;
	const canClose: boolean = !isCommitOperationRunning && !isCommitMessageGenerating;

	return (
		<Modal
			title={t("git.commit.title")}
			open={open}
			onCancel={onCancel}
			closable={canClose}
			keyboard={canClose}
			mask={{ closable: canClose }}
			className={styles.modal}
			footer={(
				<Space>
					<Button
						disabled={isCommitOperationRunning || !hasWorkspace}
						loading={commitOperation === "push"}
						onClick={(): void => onCommitAction("push")}
					>
						{t("git.commit.actions.push")}
					</Button>
					<Button
						disabled={isCommitOperationRunning || !hasWorkspace}
						loading={commitOperation === "commit_and_push"}
						onClick={(): void => onCommitAction("commit_and_push")}
					>
						{t("git.commit.actions.commitAndPush")}
					</Button>
					<Button
						type="primary"
						disabled={isCommitOperationRunning || !hasWorkspace}
						loading={commitOperation === "commit"}
						onClick={(): void => onCommitAction("commit")}
					>
						{t("git.commit.actions.commit")}
					</Button>
				</Space>
			)}
		>
			<div className={styles.commitDialogBody}>
				{errorMessage !== null ? (
					<Alert type="error" showIcon={true} description={errorMessage} />
				) : null}
				<Input.TextArea
					value={commitMessage}
					disabled={isCommitOperationRunning}
					autoSize={{ minRows: 3, maxRows: 6 }}
					placeholder={t("git.commit.messagePlaceholder")}
					onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
						onCommitMessageChange(event.target.value);
					}}
				/>
				<Checkbox
					checked={includeUnstagedChanges}
					disabled={isCommitOperationRunning}
					onChange={(event): void => {
						onIncludeUnstagedChangesChange(event.target.checked);
					}}
				>
					{t("git.commit.includeUnstaged")}
				</Checkbox>
			</div>
		</Modal>
	);
}

export default CommitActionDialog;
