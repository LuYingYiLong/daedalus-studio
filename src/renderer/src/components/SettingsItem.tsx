import type { ReactNode } from "react";
import { Typography } from "antd";
import styles from "./SettingsItem.module.css";

type SettingsItemProps = {
	title: ReactNode;
	description: ReactNode;
	children: ReactNode;
	className?: string;
};

function SettingsItem({
	title,
	description,
	children,
	className
}: SettingsItemProps): React.JSX.Element {
	return (
		<div className={[styles.item, className].filter(Boolean).join(" ")}>
			<div className={styles.meta}>
				<Typography.Text strong>{title}</Typography.Text>
				<Typography.Text type="secondary" className={styles.description}>{description}</Typography.Text>
			</div>
			<div className={styles.action}>{children}</div>
		</div>
	);
}

export default SettingsItem;
