import type { ReactNode } from "react";
import styles from "./SettingsList.module.css";
import { Typography } from "antd";

type SettingsListProps = {
	title?: ReactNode;
	children: ReactNode;
};

function SettingsList({ title, children }: SettingsListProps): React.JSX.Element {
	return (
		<section className={styles.header}>
			{title === undefined ? null : <Typography.Title level={4} className={styles.title}>{title}</Typography.Title>}
			<div className={styles.list}>
				<div className={styles.body}>{children}</div>
			</div>
		</section>
	);
}

export default SettingsList;
