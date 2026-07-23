import type { ChangeEvent, JSX } from "react";
import { Alert, Button, Checkbox, Input, Modal, Space } from "antd";
import type { CommitOrPushAction } from "@/api/workspace-git-api";
import { Icon } from "@/assets/icons";
import styles from "./GitActionDialogs.module.css";

export type GitActionDialogsProps = {
	commitOpen: boolean;
	branchOpen: boolean;
	commitMessage: string;
	includeUnstagedChanges: boolean;
	commitOperation: CommitOrPushAction | null;
	commitError: string | null;
	hasWorkspace: boolean;
	onCommitCancel: () => void;
	onCommitMessageChange: (message: string) => void;
	onIncludeUnstagedChangesChange: (include: boolean) => void;
	onCommitAction: (action: CommitOrPushAction) => void;
	onBranchClose: () => void;
};

function GitActionDialogs({
	commitOpen,
	branchOpen,
	commitMessage,
	includeUnstagedChanges,
	commitOperation,
	commitError,
	hasWorkspace,
	onCommitCancel,
	onCommitMessageChange,
	onIncludeUnstagedChangesChange,
	onCommitAction,
	onBranchClose
}: GitActionDialogsProps): JSX.Element {
	const isCommitOperationRunning: boolean = commitOperation !== null;

	return (
		<>
			<Modal
				title="Commit or push"
				open={commitOpen}
				onCancel={onCommitCancel}
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
					{commitError !== null ? (
						<Alert type="error" showIcon={true} description={commitError} />
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
			<Modal
				title="Branch"
				open={branchOpen}
				onCancel={onBranchClose}
				footer={null}
			>
				<div className={styles.branchDialogBody}>
					<Input
						allowClear={true}
						prefix={<Icon name="search" />}
						placeholder="Search branch"
						className={styles.searchBox}
					/>
					<div className={styles.branchList}>
					</div>
					<Button block>Create and checkout new branch</Button>
				</div>
			</Modal>
		</>
	);
}

export default GitActionDialogs;
