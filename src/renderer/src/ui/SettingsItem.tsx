import type { ReactNode } from "react";
import { Typography } from "antd";
import styles from "./SettingsItem.module.css";

type SettingsItemProps = {
	title: ReactNode;
	description: ReactNode;
	children: ReactNode;
	className?: string;
	searchKey?: string;
	/** Stack the setting metadata above its control. */
	vertical?: boolean;
	/** Remove row chrome when the item is used as a standalone setting block. */
	ghost?: boolean;
};

function SettingsItem({
	title,
	description,
	children,
	className,
	searchKey,
	vertical = false,
	ghost = false
}: SettingsItemProps): React.JSX.Element {
	return (
		<div
			className={[styles.item, vertical ? styles.vertical : null, ghost ? styles.ghost : null, className].filter(Boolean).join(" ")}
			data-settings-search-key={searchKey}
		>
			<div className={styles.meta}>
				<Typography.Text strong>{title}</Typography.Text>
				<Typography.Text type="secondary" className={styles.description}>{description}</Typography.Text>
			</div>
			<div className={styles.action}>{children}</div>
		</div>
	);
}

export default SettingsItem;
