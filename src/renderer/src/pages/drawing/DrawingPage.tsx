import { Typography } from "antd";
import { Icon } from "@/assets/icons";
import styles from "../PagePlaceholder.module.css";

function DrawingPage(): React.JSX.Element {
	return (
		<section className={styles.page}>
			<div className={styles.header}>
				<Icon name="scene_edit" className={styles.icon} />
				<div>
					<Typography.Title level={3} className={styles.title}>
						Draw
					</Typography.Title>
					<Typography.Text type="secondary">
						Image and canvas workflows will live here.
					</Typography.Text>
				</div>
			</div>
		</section>
	);
}

export default DrawingPage;
