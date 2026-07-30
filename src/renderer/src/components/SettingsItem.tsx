import type { ReactNode } from "react";
import { Typography } from "antd";
import styles from "./SettingsItem.module.css";

type SettingsItemProps = {
	title: ReactNode;
	description: ReactNode;
	children: ReactNode;
};

function SettingsItem({
	title,
	description,
	children
}: SettingsItemProps): React.JSX.Element {
	return (
		<div className={styles.item}>
			<div className={styles.meta}>
				<Typography.Text>{title}</Typography.Text>
				<Typography.Text type="secondary">{description}</Typography.Text>
			</div>
			{children}
		</div>
	);
}

export default SettingsItem;
