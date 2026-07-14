import { Menu, Typography } from "antd";
import { Icon } from "@/assets/icons";
import styles from "../PagePlaceholder.module.css";

function SettingsPage(): React.JSX.Element {
	return (
		<section className={styles.page}>
			<aside>
				<Menu
					
				/>
			</aside>
			<div className={styles.header}>
				<Icon name="settings" className={styles.icon} />
				<div>
					<Typography.Title level={3} className={styles.title}>
						Settings
					</Typography.Title>
					<Typography.Text type="secondary">
						Studio settings will live here.
					</Typography.Text>
				</div>
			</div>
		</section>
	);
}

export default SettingsPage;
