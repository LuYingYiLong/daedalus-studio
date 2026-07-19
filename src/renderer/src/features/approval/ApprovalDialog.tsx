import { Alert, Button, Input, theme, Typography } from "antd";
import styles from "./ApprovalDialog.module.css";
import React, { useEffect, useState } from "react";
import { PendingApproval } from "@/api/approval-api";

export type ApprovalDialogProps = {
	pendingApproval: PendingApproval | null;
	isApproving?: boolean;
	isRejecting?: boolean;
	errorMessage?: string | null;
	onApprove?: (approvalId: string, consentText?: string) => void;
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
	const [consentText, setConsentText] = useState<string>("");

	useEffect((): void => {
		setConsentText("");
	}, [pendingApproval?.approvalId]);

	if (pendingApproval === null) {
		return null;
	}

	const approvalActionButtonStyle: React.CSSProperties = {
		borderRadius: token.borderRadiusSM
	};
	const isBusy: boolean = isApproving || isRejecting;
	const requiredConsent = pendingApproval.requiredConsent;
	const isConsentSatisfied: boolean = requiredConsent === undefined || consentText === requiredConsent.expectedText;

	return (
		<div className={styles.approvalDialog}>
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

			{requiredConsent !== undefined ? (
				<div className={styles.consent}>
					<Typography.Text className={styles.consentPrompt}>
						{requiredConsent.prompt}
					</Typography.Text>
					<Typography.Text type="secondary" className={styles.consentHint}>
						Type <Typography.Text code>{requiredConsent.expectedText}</Typography.Text> to approve this cross-workspace action.
					</Typography.Text>
					<Input
						className={styles.consentInput}
						value={consentText}
						disabled={isBusy}
						placeholder={requiredConsent.expectedText}
						onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
							setConsentText(event.target.value);
						}}
					/>
				</div>
			) : null}

			<footer className={styles.actions}>
				<Button
					type="primary"
					block
					disabled={isBusy || !isConsentSatisfied}
					loading={isApproving}
					style={approvalActionButtonStyle}
					className={styles.approvalActionButton}
					onClick={(): void => {
						onApprove?.(pendingApproval.approvalId, requiredConsent === undefined ? undefined : consentText);
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
