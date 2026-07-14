import { Typography } from "antd";
import { Icon } from "@/assets/icons";
import styles from "../PagePlaceholder.module.css";

function KnowledgePage(): React.JSX.Element {
	return (
		<section className={styles.page}>
			<div className={styles.header}>
				<Icon name="read" className={styles.icon} />
				<div>
					<Typography.Title level={3} className={styles.title}>
						Knowledge
					</Typography.Title>
					<Typography.Text type="secondary">
						Knowledge base tools will live here.
					</Typography.Text>
				</div>
			</div>
		</section>
	);
}

export default KnowledgePage;
