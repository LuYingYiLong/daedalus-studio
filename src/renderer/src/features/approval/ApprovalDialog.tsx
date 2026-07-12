import { Alert, Button, Space, Tag, theme, Typography } from "antd";
import styles from "./ApprovalDialog.module.css";
import SpotlightCard from "@/components/SpotlightCard";
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

function formatApprovalArgs(args: Record<string, unknown>): string {
	return JSON.stringify(args, null, 2);
}

function formatApprovalTime(isoTime: string): string {
	const date = new Date(isoTime);

	if (!Number.isFinite(date.getTime())) {
		return isoTime;
	}

	return new Intl.DateTimeFormat(undefined, {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false
	}).format(date);
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
		boxShadow: token.boxShadowSecondary
	};
	const approvalActionButtonStyle: React.CSSProperties = {
		borderRadius: token.borderRadiusSM
	};
	const isBusy: boolean = isApproving || isRejecting;

	return (
		<div className={styles.approvalDialog} style={approvalDialogStyle}>
			<header className={styles.header}>
				<div className={styles.titleGroup}>
					<Typography.Title level={5} className={styles.title}>
						Allow tool execution?
					</Typography.Title>
					<Typography.Text type="secondary" className={styles.subtitle}>
						The assistant is waiting for approval before it continues.
					</Typography.Text>
				</div>
				<Tag color={pendingApproval.interrupted ? "warning" : "processing"}>
					{pendingApproval.interrupted ? "Interrupted" : "Pending"}
				</Tag>
			</header>

			<section className={styles.summary}>
				<div className={styles.summaryItem}>
					<Typography.Text type="secondary">Tool</Typography.Text>
					<Typography.Text strong={true}>{pendingApproval.llmToolName || pendingApproval.toolName}</Typography.Text>
				</div>
				<div className={styles.summaryItem}>
					<Typography.Text type="secondary">Requested</Typography.Text>
					<Typography.Text>{formatApprovalTime(pendingApproval.createdAt)}</Typography.Text>
				</div>
			</section>

			{pendingApproval.reason.length > 0 ? (
				<Alert
					className={styles.reason}
					type="warning"
					showIcon={true}
					title={pendingApproval.reason}
				/>
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

			<section className={styles.argsPanel}>
				<div className={styles.argsHeader}>
					<Typography.Text type="secondary">Arguments</Typography.Text>
					<Typography.Text type="secondary">{pendingApproval.approvalId}</Typography.Text>
				</div>
				<pre className={styles.argsPreview}>{formatApprovalArgs(pendingApproval.args)}</pre>
			</section>

			<footer className={styles.actions}>
				<SpotlightCard className={styles.approvalActionCard}>
					<Button
						block={true}
						type="text"
						disabled={isBusy}
						loading={isApproving}
						style={approvalActionButtonStyle}
						className={styles.approvalActionButton}
						onClick={(): void => {
							onApprove?.(pendingApproval.approvalId);
						}}
					>Approve</Button>
				</SpotlightCard>
				<SpotlightCard className={styles.approvalActionCard}>
					<Button
						block={true}
						type="text"
						danger={true}
						disabled={isBusy}
						loading={isRejecting}
						style={approvalActionButtonStyle}
						className={styles.approvalActionButton}
						onClick={(): void => {
							onReject?.(pendingApproval.approvalId);
						}}
					>Reject</Button>
				</SpotlightCard>
				<Space size={4} className={styles.meta}>
					<Typography.Text type="secondary">Request</Typography.Text>
					<Typography.Text type="secondary">{pendingApproval.requestId}</Typography.Text>
				</Space>
			</footer>
		</div>
	);
}

export default ApprovalDialog;
