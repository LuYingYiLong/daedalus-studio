import { Alert, Button, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import styles from "./FlowWelcome.module.css";

type FlowWelcomeProps = {
	onStarterSelect: (prompt: string) => void;
	errorMessage: string | null;
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
					<Icon name="check" />
				</div>
			</div>
			<Typography.Title level={1} id="flow-welcome-title" className={styles.flowWelcomeTitle}>
				{t("flow.welcome.nodeTitle", { defaultValue: "Build a workflow from nodes" })}
			</Typography.Title>
			<Typography.Paragraph className={styles.flowWelcomeDescription}>
				{t("flow.welcome.nodeDescription", {
					defaultValue: "Add Prompt, LLM, Output, and Note nodes, then connect them on the canvas.",
				})}
			</Typography.Paragraph>
			{errorMessage !== null ? (
				<Alert className={styles.flowWelcomeError} type="error" showIcon message={errorMessage} />
			) : null}
			<Button
				shape="round"
				size="large"
				type="primary"
				icon={<Icon name="add" />}
				onClick={(): void => onStarterSelect("")}
			>
				{t("flow.welcome.addPrompt", { defaultValue: "Add Prompt node" })}
			</Button>
			<Typography.Text type="secondary" className={styles.flowWelcomeHint}>
				{t("flow.welcome.shortcuts", {
					defaultValue: "Shift+A adds a Prompt node · Home fits the canvas · Ctrl/Cmd+Enter runs the Flow",
				})}
			</Typography.Text>
		</section>
	);
}

export default FlowWelcome;
