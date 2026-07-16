import React, { useState } from "react";
import styles from "./McpServersSettingsPage.module.css";
import { Typography, Tag, Space, Input, Button, Modal, Form, Select, Switch } from "antd";
import { Icon } from "@/assets/icons";
import TextArea from "antd/es/input/TextArea";
import FormItem from "antd/es/form/FormItem";

function McpServersSettingsPage(): React.JSX.Element {
	const [addMcpServerOpen, setAddMcpServerOpen] = useState<boolean>(false);

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<Typography.Title level={3} className={styles.title}>
						MCP Servers
					</Typography.Title>
					<Tag></Tag>
				</div>
				<Space.Compact>
					<Input
						allowClear={true}
						prefix={<Icon name="search" />}
						placeholder="Search MCP..."
						className={styles.searchBox}
					/>
					<Button
						variant="solid"
						icon={<Icon name="add" />}
						onClick={(): void => setAddMcpServerOpen(true)}
					>
						Add
					</Button>
				</Space.Compact>

			</header>

			<div>
				<div className={styles.mcpServerItem}>
					<Typography.Title level={4}>MCP Server name</Typography.Title>
					<Typography.Text type="secondary"></Typography.Text>
				</div>
			</div>
			<Modal
				title="Add new MCP Server"
				centered
				open={addMcpServerOpen}
				onCancel={(): void => setAddMcpServerOpen(false)}
			>
				<Form
					layout="vertical"
				>
					<Form.Item label="Name" name="name" rules={[{ required: true }]}>
						<Input />
					</Form.Item>
					<Form.Item label="Description" name="description">
						<TextArea rows={3} />
					</Form.Item>
					<FormItem label="Type" name="type" rules={[{ required: true }]}>
						<Select
							value={"stdio"}
							options={[
								{
									value: "stdio",
									label: "STDIO",
								},
								{
									value: "http",
									label: "HTTP",
								},
							]}
						/>
					</FormItem>
					<FormItem label="Plan access" name="plan_access">
						<Switch />
					</FormItem>
					<FormItem label="Command" name="command">
						<Input placeholder="npx or uvx" />
					</FormItem>
					<FormItem label="Args" name="args">
						<TextArea rows={3} placeholder={`arg1\narg2`} />
					</FormItem>
					<FormItem label="Env" name="env">
						<TextArea rows={3} placeholder={`KEY1=value1\nKEY2=value2`} />
					</FormItem>
				</Form>
			</Modal>
		</section>
	);
}

export default McpServersSettingsPage;