import React from "react";
import { Alert, Button, theme, Typography } from "antd";
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

function getLimitLabel(limitKind: PendingToolBudget["limitKind"]): string {
	return limitKind === "steps" ? "工具调用次数" : "工具结果总量";
}

function ToolBudgetDialog({
	pendingToolBudget,
	isContinuing = false,
	isStopping = false,
	errorMessage,
	onContinue,
	onStop
}: ToolBudgetDialogProps): React.JSX.Element | null {
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
					工具调用达到上限
				</Typography.Title>
				<Typography.Text type="secondary">
					模型需要更多工具预算才能继续执行。
				</Typography.Text>
			</header>

			<div className={styles.details}>
				<div className={styles.detailItem}>
					<Typography.Text type="secondary">触发上限</Typography.Text>
					<Typography.Text className={styles.detailValue}>{getLimitLabel(pendingToolBudget.limitKind)}</Typography.Text>
				</div>
				<div className={styles.detailItem}>
					<Typography.Text type="secondary">已用 step</Typography.Text>
					<Typography.Text className={styles.detailValue}>
						{formatNumber(pendingToolBudget.usedSteps)} / {formatNumber(pendingToolBudget.maxSteps)}
					</Typography.Text>
				</div>
				<div className={styles.detailItem}>
					<Typography.Text type="secondary">工具结果字符</Typography.Text>
					<Typography.Text className={styles.detailValue}>
						{formatNumber(pendingToolBudget.totalToolResultChars)} / {formatNumber(pendingToolBudget.toolResultCharLimit)}
					</Typography.Text>
				</div>
				<div className={styles.detailItem}>
					<Typography.Text type="secondary">继续追加</Typography.Text>
					<Typography.Text className={styles.detailValue}>
						+{formatNumber(pendingToolBudget.additionalSteps)} step
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
				>继续</Button>
				<Button
					danger={true}
					disabled={isBusy}
					loading={isStopping}
					style={actionButtonStyle}
					onClick={(): void => {
						onStop?.(pendingToolBudget.budgetId);
					}}
				>否，结束并总结</Button>
			</footer>
		</div>
	);
}

export default ToolBudgetDialog;
