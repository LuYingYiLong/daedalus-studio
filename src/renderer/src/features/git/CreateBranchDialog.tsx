import type { ChangeEvent, JSX } from "react";
import { Alert, Input, Modal, Typography } from "antd";
import { Icon } from "@/assets/icons";
import styles from "./GitActionDialog.module.css";

export type CreateBranchDialogProps = {
	open: boolean;
	newBranchName: string;
	newBranchStartPoint: string;
	branchOperation: "checkout" | "create" | null;
	errorMessage: string | null;
	hasWorkspace: boolean;
	onClose: () => void;
	onNewBranchNameChange: (branchName: string) => void;
	onNewBranchStartPointChange: (startPoint: string) => void;
	onCreate: () => void;
};

function CreateBranchDialog({
	open,
	newBranchName,
	newBranchStartPoint,
	branchOperation,
	errorMessage,
	hasWorkspace,
	onClose,
	onNewBranchNameChange,
	onNewBranchStartPointChange,
	onCreate
}: CreateBranchDialogProps): JSX.Element {
	const isBranchOperationRunning: boolean = branchOperation !== null;
	const canCreateBranch: boolean = hasWorkspace && newBranchName.trim().length > 0 && !isBranchOperationRunning;

	return (
		<Modal
			title="Create branch"
			open={open}
			onCancel={onClose}
			onOk={onCreate}
			okText="Create & Checkout"
			confirmLoading={branchOperation === "create"}
			okButtonProps={{ disabled: !canCreateBranch }}
			cancelButtonProps={{ disabled: isBranchOperationRunning }}
		>
			<div className={styles.createBranchDialogBody}>
				{errorMessage !== null ? (
					<Alert type="error" showIcon={true} description={errorMessage} />
				) : null}
				<Input
					value={newBranchName}
					disabled={isBranchOperationRunning || !hasWorkspace}
					placeholder="New branch name"
					autoFocus={true}
					onChange={(event: ChangeEvent<HTMLInputElement>): void => {
						onNewBranchNameChange(event.target.value);
					}}
					onPressEnter={(): void => {
						if (canCreateBranch) {
							onCreate();
						}
					}}
				/>
				<Input
					value={newBranchStartPoint}
					disabled={isBranchOperationRunning || !hasWorkspace}
					placeholder="Start point, optional"
					prefix={<Icon name="git-branch" />}
					onChange={(event: ChangeEvent<HTMLInputElement>): void => {
						onNewBranchStartPointChange(event.target.value);
					}}
				/>
				<Typography.Text type="secondary" className={styles.createBranchHint}>
					Leave start point empty to create from the current HEAD.
				</Typography.Text>
			</div>
		</Modal>
	);
}

export default CreateBranchDialog;
