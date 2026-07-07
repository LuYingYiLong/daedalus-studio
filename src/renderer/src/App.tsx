import { Button, Input, Tree, Typography } from "antd";
import type { DataNode } from "antd/es/tree";
import { Icon } from "@/assets/icons";
import type { MenuProps } from 'antd';
import { Dropdown, Space } from 'antd';
import { Divider } from 'antd';

const { TextArea } = Input;

const addContextItems: MenuProps["items"] = [
	{
		label: "Add files",
		key: "0",
	},
	{
		label: "Add folder",
		key: "1",
	},
	{
		label: "Add images",
		key: "2",
	}
]

const workspaceTree: DataNode[] = [
	{
		title: "Session",
		key: "session",
		children: [
			{
				title: "New Session",
				key: "session/session1",
			},
			{
				title: "New Session2",
				key: "session/session2",
			}
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
		<main className="app-shell">

			<aside className="workspace-panel">
				<header className="panel-header">
					<Button type="text" block={true} className="btn">New session</Button>
				</header>
				<div className="tree-area">
					<h3>Workspace</h3>
					<Tree
						className="workspace-tree"
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
						<Typography.Title level={3}>Session Name</Typography.Title>
					</div>
				</header>

				<div className="message-list">
					{messages.map((message, index) => (
						<article key={`${message.author}-${index}`} className={`message message--${message.author}`}>
							<div className="message-bubble">{message.content}</div>
						</article>
					))}
				</div>

				<footer className="composer">
					<div className="composer-input-wrap">
						<TextArea
							autoSize={{ minRows: 4, maxRows: 6 }}
							placeholder="What can I say?"
							className="composer-text-area"
						/>
						<div className="composer-bottom-bar">
							<Dropdown
								menu={{ items: addContextItems }}
								trigger={["click"]}
							>
							</Dropdown>
							<Divider orientation="vertical" />
							<Button
								type="text"
								icon={<Icon name="send" className="composer-send-btn-icon"></Icon>}
								className="composer-send-btn"
							>
							</Button>
						</div>
					</div>
				</footer>
			</section>
		</main>
	);
}

export default App;
