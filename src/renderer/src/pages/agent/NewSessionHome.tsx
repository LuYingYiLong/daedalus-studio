import { Alert, Typography } from "antd";
import type { WorkspaceConfig } from "@/api/types";
import styles from "./AgentPage.module.css";

type NewSessionHomeProps = {
	workspace: WorkspaceConfig | null;
	errorMessage: string | null;
};

function NewSessionHome({ workspace, errorMessage }: NewSessionHomeProps): React.JSX.Element {
	const title: string = workspace === null
		? "What would you like to work on?"
		: `What should we work on for ${workspace.name}?`;
	const subtitle: string = workspace === null
		? "Choose a workspace or start without one."
		: "Describe the next task for this workspace.";

	return (
		<div className={styles.homePanel}>
			<div className={styles.homeContent}>
				<Typography.Title level={1} className={styles.homeTitle}>
					{title}
				</Typography.Title>
				<Typography.Text className={styles.homeSubtitle}>
					{subtitle}
				</Typography.Text>
				{errorMessage !== null ? (
					<Alert
						type="error"
						showIcon={true}
						description={errorMessage}
						className={styles.homeError}
					/>
				) : null}
			</div>
		</div>
	);
}

export default NewSessionHome;
