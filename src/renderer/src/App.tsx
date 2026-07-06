import { Avatar, Button, ConfigProvider, Input, Tree, Typography, theme } from "antd";
import type { DataNode } from "antd/es/tree";
import { Icon } from "@/assets/icons";
import type { MenuProps } from 'antd';
import { Dropdown, Space } from 'antd';
import { Divider } from 'antd';
import { Select } from 'antd';

const { TextArea } = Input;

const topBarItems: MenuProps["items"] = [
	{
		label: "New session",
		key: "0",
	}
];

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
		<ConfigProvider
			theme={{
				algorithm: theme.darkAlgorithm,
				token: {
					colorPrimary: "#478cbf",
					borderRadius: 4
				}
			}}
		>
			<div className="titlebar">
				<Icon className="titlebar-icon" name="icon" />
				<p>Daedalus Studio</p>
				<Dropdown
					menu={{ items: topBarItems }}
					trigger={["click"]}
				>
					<Space className="titlebar-action">
						Files
					</Space>
				</Dropdown>
				<Select
					size="small"
					placeholder="Search..."
					notFoundContent="No session"
					className="search-box"
					suffixIcon={<Icon name="collapse" style={{ opacity: 0.5 }}/>}
				/ >
			</div>
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
		</ConfigProvider>
	);
}

export default App;
