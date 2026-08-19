import { Button, Collapse, Divider, Empty, Popover, Spin, Tooltip, Typography } from "antd";
import type { CollapseProps } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import styles from "./HomePage.module.css";

type SessionSummaryPopoverProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	isLoading: boolean;
	hasOverview: boolean;
	error: string | null;
	items: NonNullable<CollapseProps["items"]>;
	onReload: () => void;
	onExpandEnvironment: () => void;
};

function SessionSummaryPopover({
	open,
	onOpenChange,
	isLoading,
	hasOverview,
	error,
	items,
	onReload,
	onExpandEnvironment,
}: SessionSummaryPopoverProps): React.JSX.Element {
	const { t } = useTranslation();
	const content: React.ReactNode = (
		<div className={styles.summaryPanel}>
			{isLoading && !hasOverview ? (
				<div className={styles.summaryLoading}>
					<Spin />
				</div>
			) : error !== null ? (
				<div className={styles.summaryEmpty}>
					<Typography.Text type="danger">{error}</Typography.Text>
					<Button type="text" icon={<Icon name="refresh" />} onClick={onReload}>
						{t("agentPage.summary.actions.retry")}
					</Button>
				</div>
			) : items.length > 0 ? (
				items.map((item, index): React.ReactNode => {
					const itemKey: string = String(item?.key ?? index);
					return (
						<div key={itemKey}>
							{index > 0 ? <Divider size="small" /> : null}
							<Collapse
								size="small"
								bordered={false}
								items={item === undefined ? [] : [item]}
								className={styles.summaryCollapse}
								defaultActiveKey={[itemKey]}
								onChange={(activeKeys: string | string[]): void => {
									const expanded: boolean = Array.isArray(activeKeys)
										? activeKeys.includes(itemKey)
										: activeKeys === itemKey;
									if (expanded && itemKey.startsWith("env_info:")) {
										onExpandEnvironment();
									}
								}}
							/>
						</div>
					);
				})
			) : (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={t("agentPage.summary.empty")}
					className={styles.summaryEmpty}
				/>
			)}
		</div>
	);

	return (
		<Popover
			trigger={["click"]}
			placement="bottom"
			open={open}
			onOpenChange={onOpenChange}
			fresh
			className={styles.summaryPopver}
			content={content}
		>
			<Tooltip title={t("agentPage.summary.tooltip")} placement="bottom">
				<Button
					type="text"
					shape="circle"
					aria-label={t("agentPage.summary.aria.open")}
					aria-pressed={open}
					icon={<Icon name="list-check" />}
				/>
			</Tooltip>
		</Popover>
	);
}

export default SessionSummaryPopover;
