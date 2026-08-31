import { Alert, Button, Descriptions, Input, List, Select, Space, Switch, Tag, Typography } from "antd";
import type React from "react";
import type { PluginUiNode } from "@/features/plugins/plugin-ui-schema";
import { parsePluginUiView } from "@/features/plugins/plugin-ui-schema";

export default function PluginPanelHost({ view, onAction }: { view: unknown; onAction?: (action: string, value?: unknown) => void }): React.JSX.Element {
	return <Space direction="vertical" size="small" style={{ width: "100%" }}>{parsePluginUiView(view).map((node, index) => {
		const key = `${node.type}:${index}`;
		switch (node.type) {
			case "Text": return <Typography.Text key={key}>{node.text}</Typography.Text>;
			case "Icon": return <span key={key} aria-hidden>{node.name}</span>;
			case "Tag": return <Tag key={key} color={node.color}>{node.text}</Tag>;
			case "Alert": return <Alert key={key} type={node.typeValue ?? "info"} message={node.message} showIcon />;
			case "Descriptions": return <Descriptions key={key} size="small" column={1} items={node.items.map((item) => ({ key: item.label, label: item.label, children: item.value }))} />;
			case "Input": return <Input key={key} aria-label={node.label} placeholder={node.placeholder} defaultValue={node.value} onChange={(event) => onAction?.(`input:${node.id}`, event.target.value)} />;
			case "Select": return <Select key={key} aria-label={node.label} style={{ minWidth: 180 }} value={node.value} options={node.options} onChange={(value) => onAction?.(`select:${node.id}`, value)} />;
			case "Switch": return <Space key={key}><Typography.Text>{node.label}</Typography.Text><Switch checked={node.checked} onChange={(checked) => onAction?.(`switch:${node.id}`, checked)} /></Space>;
			case "Button": return <Button key={key} onClick={() => onAction?.(node.action ?? node.id)}>{node.label}</Button>;
			case "List": return <List key={key} size="small" dataSource={node.items} renderItem={(item) => <List.Item><List.Item.Meta title={item.title} description={item.description} /></List.Item>} />;
		}
	})}</Space>;
}
