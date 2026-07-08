import { Button, Divider, Dropdown, Input, Typography } from "antd";
import type { MenuProps } from "antd";
import { Icon } from "@/assets/icons";
import { selectWorkspace } from "@/api/workspace-api";
import styles from "./App.module.css";
import WorkspaceTree from "@/features/workspace/WorkspaceTree";

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

type ChatMessage = {
	author: "assistant" | "user";
	content: string;
};

const messages: ChatMessage[] = [
	{
		author: "assistant",
		content: "选择左侧 Godot 工作区文件后，可以让我检查场景、修复脚本或运行验证。"
	},
	{
		author: "user",
		content: "先帮我看一下 main.tscn 的节点结构。"
	}
];

function App(): React.JSX.Element {
	async function handleWorkspaceSelect(workspaceId: string): Promise<void> {
		try {
			const workspace = await selectWorkspace(workspaceId);

			console.info("[App] workspace selected", workspace);
		} catch (error: unknown) {
			console.error("[App] select workspace failed", error);
		}
	}

	function handleSessionSelect(sessionId: string): void {
		console.info("[App] session selected", { sessionId });
	}

	return (
		<main className={styles.shell}>
			<aside className={styles.workspaceSidebar}>
				<header className={styles.workspaceHeader}>
					<Button type="text" block={true} className={styles.createSessionButton}>
						New session
					</Button>
				</header>

				<WorkspaceTree
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

				<div className={styles.messageList}>
					{messages.map((message: ChatMessage, index: number) => (
						<article
							key={`${message.author}-${index}`}
							className={`${styles.messageItem} ${message.author === "user" ? styles.messageItemUser : ""}`}
						>
							<div className={styles.messageBubble}>{message.content}</div>
						</article>
					))}
				</div>

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
							<Divider type="vertical" className={styles.composerDivider} />
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
