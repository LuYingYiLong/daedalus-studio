import React from "react";
import { Alert, Button, theme, Typography } from "antd";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { PendingToolBudget } from "@/api/types";
import styles from "./ToolBudgetDialog.module.css";

export type ToolBudgetDialogProps = {
	pendingToolBudget: PendingToolBudget | null;
	isContinuing?: boolean;
	isStopping?: boolean;
	errorMessage?: string | null;
	onContinue?: (budgetId: string) => void;
	onStop?: (budgetId: string) => void;
};

function formatNumber(value: number): string {
	return new Intl.NumberFormat().format(value);
}

function getLimitLabel(limitKind: PendingToolBudget["limitKind"], t: TFunction<"common">): string {
	return limitKind === "steps" ? t("approval.toolBudget.limitKind.steps") : t("approval.toolBudget.limitKind.toolResultChars");
}

function ToolBudgetDialog({
	pendingToolBudget,
	isContinuing = false,
	isStopping = false,
	errorMessage,
	onContinue,
	onStop
}: ToolBudgetDialogProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	if (pendingToolBudget === null) {
		return null;
	}

	const isBusy: boolean = isContinuing || isStopping;
	const actionButtonStyle: React.CSSProperties = {
		borderRadius: token.borderRadiusSM
	};

	return (
		<div className={styles.toolBudgetDialog}>
			<header className={styles.header}>
				<Typography.Title level={4} className={styles.title}>
					{t("approval.toolBudget.title")}
				</Typography.Title>
				<Typography.Text type="secondary">
					{t("approval.toolBudget.subtitle")}
				</Typography.Text>
			</header>

			<div className={styles.details}>
				<div className={styles.detailItem}>
					<Typography.Text type="secondary">{t("approval.toolBudget.fields.triggeredLimit")}</Typography.Text>
					<Typography.Text className={styles.detailValue}>{getLimitLabel(pendingToolBudget.limitKind, t)}</Typography.Text>
				</div>
				<div className={styles.detailItem}>
					<Typography.Text type="secondary">{t("approval.toolBudget.fields.usedSteps")}</Typography.Text>
					<Typography.Text className={styles.detailValue}>
						{formatNumber(pendingToolBudget.usedSteps)} / {formatNumber(pendingToolBudget.maxSteps)}
					</Typography.Text>
				</div>
				<div className={styles.detailItem}>
					<Typography.Text type="secondary">{t("approval.toolBudget.fields.toolResultChars")}</Typography.Text>
					<Typography.Text className={styles.detailValue}>
						{formatNumber(pendingToolBudget.totalToolResultChars)} / {formatNumber(pendingToolBudget.toolResultCharLimit)}
					</Typography.Text>
				</div>
				<div className={styles.detailItem}>
					<Typography.Text type="secondary">{t("approval.toolBudget.fields.additionalSteps")}</Typography.Text>
					<Typography.Text className={styles.detailValue}>
						{t("approval.toolBudget.additionalStepsValue", {
							count: pendingToolBudget.additionalSteps,
							formatted: formatNumber(pendingToolBudget.additionalSteps)
						})}
					</Typography.Text>
				</div>
			</div>

			<Typography.Paragraph className={styles.reason}>
				{pendingToolBudget.reason}
			</Typography.Paragraph>

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
					disabled={isBusy}
					loading={isContinuing}
					style={actionButtonStyle}
					onClick={(): void => {
						onContinue?.(pendingToolBudget.budgetId);
					}}
				>{t("approval.toolBudget.actions.continue")}</Button>
				<Button
					danger={true}
					disabled={isBusy}
					loading={isStopping}
					style={actionButtonStyle}
					onClick={(): void => {
						onStop?.(pendingToolBudget.budgetId);
					}}
				>{t("approval.toolBudget.actions.stop")}</Button>
			</footer>
		</div>
	);
}

export default ToolBudgetDialog;
