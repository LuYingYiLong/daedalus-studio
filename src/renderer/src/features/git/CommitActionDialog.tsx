import type { ChangeEvent, JSX } from "react";
import { Alert, Button, Checkbox, Input, Modal, Space } from "antd";
import type { CommitOrPushAction } from "@/api/workspace-git-api";
import styles from "./GitActionDialog.module.css";

export type CommitActionDialogProps = {
	open: boolean;
	commitMessage: string;
	includeUnstagedChanges: boolean;
	commitOperation: CommitOrPushAction | null;
	errorMessage: string | null;
	hasWorkspace: boolean;
	onCancel: () => void;
	onCommitMessageChange: (message: string) => void;
	onIncludeUnstagedChangesChange: (include: boolean) => void;
	onCommitAction: (action: CommitOrPushAction) => void;
};

function CommitActionDialog({
	open,
	commitMessage,
	includeUnstagedChanges,
	commitOperation,
	errorMessage,
	hasWorkspace,
	onCancel,
	onCommitMessageChange,
	onIncludeUnstagedChangesChange,
	onCommitAction
}: CommitActionDialogProps): JSX.Element {
	const isCommitOperationRunning: boolean = commitOperation !== null;

	return (
		<Modal
			title="Commit or push"
			open={open}
			onCancel={onCancel}
			footer={(
				<Space>
					<Button
						disabled={isCommitOperationRunning || !hasWorkspace}
						loading={commitOperation === "push"}
						onClick={(): void => onCommitAction("push")}
					>
						Push
					</Button>
					<Button
						disabled={isCommitOperationRunning || !hasWorkspace}
						loading={commitOperation === "commit_and_push"}
						onClick={(): void => onCommitAction("commit_and_push")}
					>
						Commit & Push
					</Button>
					<Button
						type="primary"
						disabled={isCommitOperationRunning || !hasWorkspace}
						loading={commitOperation === "commit"}
						onClick={(): void => onCommitAction("commit")}
					>
						Commit
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
					placeholder="Leaving it blank will automatically generate the information"
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
					Includes unstaged changes
				</Checkbox>
			</div>
		</Modal>
	);
}

export default CommitActionDialog;
