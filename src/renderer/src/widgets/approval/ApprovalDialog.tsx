import { Alert, Button, Dropdown, Input, Space, theme, Typography, type MenuProps } from "antd";
import styles from "./ApprovalDialog.module.css";
import React, { useEffect, useState } from "react";
import { PendingApproval } from "@/platform/rpc/approval-api";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";

export type ApprovalDialogProps = {
	pendingApproval: PendingApproval | null;
	isApproving?: boolean;
	isApprovalAutoSafeEnabling?: boolean;
	isRejecting?: boolean;
	errorMessage?: string | null;
	onApprove?: (approvalId: string, consentText?: string) => void;
	onApproveAndEnableAutoSafe?: (
		approvalId: string,
		consentText?: string,
	) => void;
	onReject?: (approvalId: string) => void;
};

function ApprovalDialog({
	pendingApproval,
	isApproving = false,
	isApprovalAutoSafeEnabling = false,
	isRejecting = false,
	errorMessage,
	onApprove,
	onApproveAndEnableAutoSafe,
	onReject,
}: ApprovalDialogProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const [consentText, setConsentText] = useState<string>("");

	useEffect((): void => {
		setConsentText("");
	}, [pendingApproval?.approvalId]);

	if (pendingApproval === null) {
		return null;
	}

	const isBusy: boolean =
		isApproving || isApprovalAutoSafeEnabling || isRejecting;
	const requiredConsent = pendingApproval.requiredConsent;
	const isConsentSatisfied: boolean =
		requiredConsent === undefined ||
		consentText === requiredConsent.expectedText;
	const approvalMenuItems: MenuProps["items"] = [
		{
			key: "enable-auto-safe",
			label: t("approval.tool.actions.approveAndEnableAutoSafe"),
			icon: <Icon name="shield" />,
			disabled: isBusy || !isConsentSatisfied,
			onClick: (): void => {
				onApproveAndEnableAutoSafe?.(
					pendingApproval.approvalId,
					requiredConsent === undefined ? undefined : consentText,
				);
			},
		},
	];

	return (
		<div className={styles.approvalDialog} data-studio-approval="true">
			<header className={styles.header}>
				<div className={styles.titleGroup}>
					<Typography.Title level={4} className={styles.title}>
						{t("approval.tool.title")}
					</Typography.Title>
					<Typography.Text
						type="secondary"
						className={styles.subtitle}
					>
						{t("approval.tool.subtitle")}
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
					<Typography.Text
						type="secondary"
						className={styles.consentHint}
					>
						{t("approval.tool.consentPrefix")}{" "}
						<Typography.Text code>
							{requiredConsent.expectedText}
						</Typography.Text>{" "}
						{t("approval.tool.consentSuffix")}
					</Typography.Text>
					<Input
						className={styles.consentInput}
						value={consentText}
						disabled={isBusy}
						placeholder={requiredConsent.expectedText}
						onChange={(
							event: React.ChangeEvent<HTMLInputElement>,
						): void => {
							setConsentText(event.target.value);
						}}
					/>
				</div>
			) : null}

			<footer className={styles.actions}>
				<Button
					danger={true}
					disabled={isBusy}
					loading={isRejecting}
					className={styles.approvalActionButton}
					data-studio-approval-reject="true"
					onClick={(): void => {
						onReject?.(pendingApproval.approvalId);
					}}
				>
					{t("approval.tool.actions.reject")}
				</Button>
				<Space.Compact>
					<Button
						type="primary"
						disabled={isBusy || !isConsentSatisfied}
						loading={isApproving}
						className={styles.approvalActionButton}
						data-studio-approval-approve="true"
						onClick={(): void => {
							onApprove?.(
								pendingApproval.approvalId,
								requiredConsent === undefined
									? undefined
									: consentText,
							);
						}}
					>
						{t("approval.tool.actions.approve")}
					</Button>
					<Dropdown menu={{ items: approvalMenuItems }} trigger={["click"]}>
						<Button
							type="primary"
							disabled={isBusy || !isConsentSatisfied}
							loading={isApprovalAutoSafeEnabling}
							icon={<Icon name="more-v" />}
							className={styles.approvalActionButton}
						/>
					</Dropdown>
				</Space.Compact>
			</footer>
		</div>
	);
}

export default ApprovalDialog;
