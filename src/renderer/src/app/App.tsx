import { useState } from "react";
import { Button, Divider, Dropdown, Input, Typography } from "antd";
import type { MenuProps } from "antd";
import { Icon } from "@/assets/icons";
import { selectWorkspace } from "@/api/workspace-api";
import styles from "./App.module.css";
import WorkspaceTree from "@/features/workspace/WorkspaceTree";
import { SessionOpenResult, TimelineBlock } from "@/api/types";
import { openSession } from "@/api/session-api";
import MessageList from "@/features/chat/MessageList";

const { TextArea } = Input;

const addContextItems: MenuProps["items"] = [
	{
		label: "Add files",
		key: "0"
	},
	{
		label: "Add folder",
		key: "1"
	},
	{
		label: "Add images",
		key: "2"
	}
];

function App(): React.JSX.Element {
	const [workspaceRefreshToken, setWorkspaceRefreshToken] = useState<number>(0);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [timelineBlocks, setTimelineBlocks] = useState<TimelineBlock[]>([]);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [isSessionLoading, setIsSessionLoading] = useState(false);

	async function handleWorkspaceSelect(workspaceId: string): Promise<void> {
		try {
			const workspace = await selectWorkspace(workspaceId);

			console.info("[App] workspace selected", workspace);
		} catch (error: unknown) {
			console.error("[App] select workspace failed", error);
		}
	}

	async function handleSessionSelect(sessionId: string): Promise<void> {
		console.info("[App] session selected", { sessionId });

		try {
			setIsSessionLoading(true);
			setSessionError(null);
			setActiveSessionId(sessionId);
			setTimelineBlocks([]);

			const result: SessionOpenResult = await openSession(sessionId);

			setTimelineBlocks(result.timelineBlocks);

			if (result.workspaceWarning) {
				console.warn("[App] session workspace warning", result.workspaceWarning);
			}
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to open session";

			setSessionError(message);
			console.error("[App] open session failed", error)
		} finally {
			setIsSessionLoading(false);
		}
	}

	return (
		<main className={styles.shell}>
			<aside className={styles.workspaceSidebar}>
				<header className={styles.workspaceHeader}>
					<Button type="text" block={true} className={styles.createSessionButton}>
						New session
					</Button>
				</header>

				<div className={styles.workspaceTitleRow}>
					<Typography.Title level={4} className={styles.workspaceTitle}>
						Workspace
					</Typography.Title>
					<Button
						className={styles.workspaceRefreshButton}
						size="small"
						type="text"
						icon={<Icon name="reload" />}
						onClick={(): void => {
							setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
						}}
					/>
				</div>

				<WorkspaceTree
					refreshToken={workspaceRefreshToken}
					onWorkspaceSelect={(workspaceId: string): void => {
						void handleWorkspaceSelect(workspaceId);
					}}
					onSessionSelect={handleSessionSelect}
				/>
			</aside>

			<section className={styles.chatPanel}>
				<header className={styles.chatHeader}>
					<Typography.Title level={4} className={styles.chatTitle}>
						Session Name
					</Typography.Title>
				</header>

				<MessageList
					blocks={timelineBlocks}
					isLoading={isSessionLoading}
					errorMessage={sessionError}
				/>

				<footer className={styles.composer}>
					<div className={styles.composerInputWrap}>
						<TextArea
							autoSize={{ minRows: 4, maxRows: 6 }}
							placeholder="What can I say?"
							className={styles.composerTextArea}
						/>
						<div className={styles.composerToolbar}>
							<Dropdown
								menu={{ items: addContextItems }}
								trigger={["click"]}
							>
								<Button
									type="text"
									icon={<Icon name="add" className={styles.composerActionIcon} />}
									className={styles.composerActionButton}
								/>
							</Dropdown>
							<Divider vertical={true} className={styles.composerDivider} />
							<Button
								type="text"
								icon={<Icon name="send" className={styles.composerSendIcon} />}
								className={styles.composerSendButton}
							/>
						</div>
					</div>
				</footer>
			</section>
		</main>
	);
}

export default App;
