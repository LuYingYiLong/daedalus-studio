import { Alert, Button, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import styles from "./FlowWelcome.module.css";

type FlowWelcomeProps = {
	onStarterSelect: (prompt: string) => void;
	errorMessage: string | null;
};

type FlowWelcomeStarter = {
	id: "explore" | "decompose" | "compare";
};

const STARTERS: readonly FlowWelcomeStarter[] = [{ id: "explore" }, { id: "decompose" }, { id: "compare" }];

const STARTER_ICONS: Record<FlowWelcomeStarter["id"], string> = {
	explore: "search",
	decompose: "plan",
	compare: "fork",
};

function FlowWelcome({ onStarterSelect, errorMessage }: FlowWelcomeProps): React.JSX.Element {
	const { t } = useTranslation();
	return (
		<section className={styles.flowWelcome} aria-labelledby="flow-welcome-title">
			<div className={styles.welcomeGraph} aria-hidden="true">
				<div className={`${styles.welcomeNode} ${styles.welcomeNodeUser}`}>
					<Icon name="user" />
				</div>
				<span className={styles.welcomeEdge} />
				<div className={`${styles.welcomeNode} ${styles.welcomeNodeAssistant}`}>
					<Icon name="agent" />
				</div>
				<span className={styles.welcomeBranchEdge} />
				<div className={`${styles.welcomeNode} ${styles.welcomeNodeBranch}`}>
					<Icon name="fork" />
				</div>
			</div>
			<Typography.Title level={1} id="flow-welcome-title" className={styles.flowWelcomeTitle}>
				{t("flow.welcome.title")}
			</Typography.Title>
			{errorMessage !== null ? (
				<Alert className={styles.flowWelcomeError} type="error" showIcon message={errorMessage} />
			) : null}
			<div className={styles.flowWelcomeStarters} aria-label={t("flow.welcome.starters.label")}>
				{STARTERS.map(
					(starter): React.JSX.Element => (
						<Button
							key={starter.id}
							shape="round"
							className={styles.flowWelcomeStarter}
							icon={<Icon name={STARTER_ICONS[starter.id]} />}
							onClick={(): void => onStarterSelect(t(`flow.welcome.starters.${starter.id}.prompt`))}
						>
							{t(`flow.welcome.starters.${starter.id}.label`)}
						</Button>
					),
				)}
			</div>
		</section>
	);
}

export default FlowWelcome;
