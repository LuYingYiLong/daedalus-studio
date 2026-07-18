import { Alert, Button, theme, Typography } from "antd";
import styles from "./ApprovalDialog.module.css";
import React from "react";
import { PendingApproval } from "@/api/approval-api";

export type ApprovalDialogProps = {
	pendingApproval: PendingApproval | null;
	isApproving?: boolean;
	isRejecting?: boolean;
	errorMessage?: string | null;
	onApprove?: (approvalId: string) => void;
	onReject?: (approvalId: string) => void;
}

function ApprovalDialog({
	pendingApproval,
	isApproving = false,
	isRejecting = false,
	errorMessage,
	onApprove,
	onReject
}: ApprovalDialogProps): React.JSX.Element | null {
	const { token } = theme.useToken();

	if (pendingApproval === null) {
		return null;
	}

	const approvalDialogStyle: React.CSSProperties = {
		backgroundColor: token.colorBgElevated,
		borderColor: token.colorBorderSecondary,
		borderRadius: token.borderRadiusLG,
		boxShadow: "none"
	};
	const approvalActionButtonStyle: React.CSSProperties = {
		borderRadius: token.borderRadiusSM
	};
	const isBusy: boolean = isApproving || isRejecting;

	return (
		<div className={styles.approvalDialog} style={approvalDialogStyle}>
			<header className={styles.header}>
				<div className={styles.titleGroup}>
					<Typography.Title level={4} className={styles.title}>
						Approve tool execution?
					</Typography.Title>
					<Typography.Text type="secondary" className={styles.subtitle}>
						The assistant is waiting for approval before it continues.
					</Typography.Text>
				</div>
			</header>

			{pendingApproval.reason.length > 0 ? (
				<Typography.Paragraph className={styles.reason}>
					{pendingApproval.reason}
				</Typography.Paragraph>
			) : null}

			{pendingApproval.lastError ? (
				<Alert
					className={styles.error}
					type="error"
					showIcon={true}
					title={pendingApproval.lastError}
				/>
			) : null}

			{errorMessage ? (
				<Alert
					className={styles.error}
					type="error"
					showIcon={true}
					title={errorMessage}
				/>
			) : null}

			<footer className={styles.actions}>
				<Button
					type="primary"
					block
					disabled={isBusy}
					loading={isApproving}
					style={approvalActionButtonStyle}
					className={styles.approvalActionButton}
					onClick={(): void => {
						onApprove?.(pendingApproval.approvalId);
					}}
				>Approve</Button>
				<Button
					danger={true}
					block
					disabled={isBusy}
					loading={isRejecting}
					style={approvalActionButtonStyle}
					className={styles.approvalActionButton}
					onClick={(): void => {
						onReject?.(pendingApproval.approvalId);
					}}
				>Reject</Button>
			</footer>
		</div>
	);
}

export default ApprovalDialog;
