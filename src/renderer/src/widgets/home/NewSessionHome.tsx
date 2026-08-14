import { Alert, Button, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { WorkspaceConfig } from "@/platform/rpc/types";
import styles from "./NewSessionHome.module.css";
import {
	getNewSessionGreetingPeriod,
	UNBOUND_STARTER_IDS,
	WORKSPACE_STARTER_IDS,
	type NewSessionStarterId
} from "./new-session-home-content";

type NewSessionHomeProps = {
	workspace: WorkspaceConfig | null;
	errorMessage: string | null;
	message: string;
	onStarterSelect: (prompt: string) => void;
};

type NewSessionStarter = {
	id: NewSessionStarterId;
	iconName: string;
};

const STARTER_ICONS: Record<NewSessionStarterId, string> = {
	explore: "search",
	next_step: "concept",
	plan: "plan"
};

function NewSessionHome({ workspace, errorMessage, message, onStarterSelect }: NewSessionHomeProps): React.JSX.Element {
	const { t } = useTranslation();
	const hasComposerText: boolean = message.trim().length > 0;
	const greetingPeriod = getNewSessionGreetingPeriod(new Date().getHours());
	const title: string = t(`app.home.greeting.${greetingPeriod}`);
	const subtitle: string = workspace === null
		? t("app.home.subtitleWithoutWorkspace")
		: t("app.home.subtitleWithWorkspace", { workspaceName: workspace.name });
	const starterIds: readonly NewSessionStarterId[] = workspace === null
		? UNBOUND_STARTER_IDS
		: WORKSPACE_STARTER_IDS;
	const starterScope: "unbound" | "workspace" = workspace === null ? "unbound" : "workspace";
	const starters: NewSessionStarter[] = starterIds.map((id: NewSessionStarterId): NewSessionStarter => ({
		id,
		iconName: STARTER_ICONS[id]
	}));

	return (
		<section className={styles.homePanel} aria-labelledby="new-session-home-title">
			<div className={styles.homeCenter}>
				<div className={styles.homeContent}>
					<Typography.Title level={1} className={styles.homeTitle}>
						<span id="new-session-home-title">{title}</span>
					</Typography.Title>
					<Typography.Text className={styles.homeSubtitle}>
						{subtitle}
					</Typography.Text>
				</div>
				{hasComposerText === false ? (
					<div className={styles.starterGroup} aria-label={t("app.home.starters.label")}>
						<div className={styles.starterList}>
							{starters.map((starter: NewSessionStarter): React.JSX.Element => (
								<Button
									key={starter.id}
									type="text"
									className={styles.starterButton}
									icon={<Icon name={starter.iconName} />}
									onClick={(): void => onStarterSelect(t(`app.home.starters.${starterScope}.${starter.id}.prompt`))}
								>
									{t(`app.home.starters.${starterScope}.${starter.id}.label`)}
								</Button>
							))}
						</div>
					</div>
				) : null}
			</div>
			{errorMessage !== null ? (
				<Alert
					type="error"
					showIcon={true}
					description={errorMessage}
					className={styles.homeError}
				/>
			) : null}
		</section>
	);
}

export default NewSessionHome;
