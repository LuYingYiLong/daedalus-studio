import { Alert, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { WorkspaceConfig } from "@/api/types";
import styles from "./AgentPage.module.css";

type NewSessionHomeProps = {
	workspace: WorkspaceConfig | null;
	errorMessage: string | null;
};

function NewSessionHome({ workspace, errorMessage }: NewSessionHomeProps): React.JSX.Element {
	const { t } = useTranslation();
	const title: string = workspace === null
		? t("app.home.titleWithoutWorkspace")
		: t("app.home.titleWithWorkspace", { workspaceName: workspace.name });
	const subtitle: string = workspace === null
		? t("app.home.subtitleWithoutWorkspace")
		: t("app.home.subtitleWithWorkspace");

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
