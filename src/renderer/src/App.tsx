import { Avatar, Button, ConfigProvider, Input, Tree, Typography, theme } from "antd";
import type { DataNode } from "antd/es/tree";

const { TextArea } = Input;

const workspaceTree: DataNode[] = [
	{
		title: "prototype",
		key: "prototype",
		children: [
			{
				title: "scenes",
				key: "prototype/scenes",
				children: [
					{ title: "main.tscn", key: "prototype/scenes/main.tscn" },
					{ title: "player.tscn", key: "prototype/scenes/player.tscn" }
				]
			},
			{
				title: "scripts",
				key: "prototype/scripts",
				children: [
					{ title: "player_controller.gd", key: "prototype/scripts/player_controller.gd" },
					{ title: "inventory.gd", key: "prototype/scripts/inventory.gd" }
				]
			},
			{ title: "project.godot", key: "prototype/project.godot" }
		]
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
	return (
		<ConfigProvider
			theme={{
				algorithm: theme.darkAlgorithm,
				token: {
					colorPrimary: "#2f8c78",
					borderRadius: 8,
					fontFamily: "\"Microsoft YaHei\", \"Segoe UI\", sans-serif"
				}
			}}
		>
			<main className="app-shell">
				<aside className="workspace-pane">
					<header className="pane-header">
						<Typography.Title level={4}>工作区</Typography.Title>
						<Typography.Text type="secondary">D:\GodotProjects\prototype</Typography.Text>
					</header>
					<div className="tree-area">
						<Tree
							blockNode
							defaultExpandAll
							defaultSelectedKeys={["prototype/scenes/main.tscn"]}
							treeData={workspaceTree}
						/>
					</div>
				</aside>

				<section className="chat-pane">
					<header className="chat-header">
						<div>
							<Typography.Title level={3}>Daedalus</Typography.Title>
							<Typography.Text type="secondary">Godot assistant session</Typography.Text>
						</div>
						<Button type="primary">新建会话</Button>
					</header>

					<div className="message-list">
						{messages.map((message, index) => (
							<article key={`${message.author}-${index}`} className={`message message--${message.author}`}>
								<Avatar>{message.author === "assistant" ? "D" : "我"}</Avatar>
								<div className="message-bubble">{message.content}</div>
							</article>
						))}
					</div>

					<footer className="composer">
						<TextArea
							autoSize={{ minRows: 2, maxRows: 6 }}
							placeholder="输入任务，例如：检查当前场景并给出修复建议"
						/>
						<Button type="primary">发送</Button>
					</footer>
				</section>
			</main>
		</ConfigProvider>
	);
}

export default App;
