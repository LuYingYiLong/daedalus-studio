import { Alert, Button, Select, Typography } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { WorkspaceConfig } from "@/platform/rpc/types";
import styles from "./FlowWelcome.module.css";

type FlowWelcomeCreateProps = {
	mode: "create";
	workspaces: WorkspaceConfig[];
	isCreating: boolean;
	onCreate: (workspaceId: string | null) => void;
	errorMessage: string | null;
};

type FlowWelcomeEmptyProps = {
	mode: "empty";
	onAddPrompt: () => void;
	errorMessage: string | null;
};

type FlowWelcomeProps = FlowWelcomeCreateProps | FlowWelcomeEmptyProps;

function FlowWelcome(props: FlowWelcomeProps): React.JSX.Element {
	const { t } = useTranslation();
	const [workspaceId, setWorkspaceId] = useState<string>("");
	const workspaces = props.mode === "create" ? props.workspaces : null;
	useEffect((): void => {
		if (workspaceId.length > 0 && workspaces !== null && !workspaces.some((workspace): boolean => workspace.id === workspaceId)) setWorkspaceId("");
	}, [workspaceId, workspaces]);
	const errorMessage = props.errorMessage;
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
			<div className={styles.flowWelcomeDetails}>
				<Typography.Paragraph className={styles.flowWelcomeDescription}>
					{t("flow.welcome.nodeDescription", {
						defaultValue: "Add Prompt, LLM, Output, and Note nodes, then connect them on the canvas.",
					})}
				</Typography.Paragraph>
				{errorMessage !== null ? (
					<Alert className={styles.flowWelcomeError} type="error" showIcon message={errorMessage} />
				) : null}
				{props.mode === "create" ? (
					<div className={styles.flowWelcomeCreateControls}>
						<Select
							className={styles.flowWelcomeWorkspaceSelect}
							value={workspaceId}
							aria-label={t("flow.welcome.workspaceLabel")}
							options={[
								{ value: "", label: t("flow.welcome.noWorkspace") },
								...props.workspaces.map((workspace): { value: string; label: string } => ({
									value: workspace.id,
									label: workspace.name,
								})),
							]}
							onChange={setWorkspaceId}
						/>
						<Button
							shape="round"
							size="large"
							type="primary"
							loading={props.isCreating}
							icon={<Icon name="add" />}
							onClick={(): void => props.onCreate(workspaceId.length === 0 ? null : workspaceId)}
						>
							{t("flow.welcome.createFlow")}
						</Button>
					</div>
				) : (
					<Button
						shape="round"
						size="large"
						type="primary"
						icon={<Icon name="add" />}
						onClick={props.onAddPrompt}
					>
						{t("flow.welcome.addPrompt", { defaultValue: "Add Prompt node" })}
					</Button>
				)}
			</div>
		</section>
	);
}

export default FlowWelcome;
