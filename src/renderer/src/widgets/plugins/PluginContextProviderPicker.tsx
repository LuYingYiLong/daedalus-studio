import { Button, Empty, List, Modal, Spin, Tooltip, Typography } from "antd";
import React from "react";
import { listPluginContextProviders, resolvePluginContextProvider } from "@/platform/rpc/plugin-p2-api";
import { Icon } from "@/assets/icons";

export default function PluginContextProviderPicker({ onAddContext }: { onAddContext?: (value: Record<string, unknown>) => void }): React.JSX.Element {
	const [open, setOpen] = React.useState(false);
	const [loading, setLoading] = React.useState(false);
	const [providers, setProviders] = React.useState<Array<Record<string, unknown>>>([]);
	const [error, setError] = React.useState<string | null>(null);
	async function openPicker(): Promise<void> {
		setOpen(true); setLoading(true); setError(null);
		try { setProviders((await listPluginContextProviders()).providers); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load providers"); }
		finally { setLoading(false); }
	}
	async function resolve(providerId: string): Promise<void> {
		setLoading(true); setError(null);
		try { onAddContext?.(await resolvePluginContextProvider(providerId)); setOpen(false); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to resolve provider"); }
		finally { setLoading(false); }
	}
	return <>
		<Tooltip title="Add plugin context">
			<Button type="text" shape="circle" aria-label="Add plugin context" icon={<Icon name="plugin" />} onClick={() => void openPicker()} />
		</Tooltip>
		<Modal open={open} title="Plugin context" footer={null} onCancel={() => setOpen(false)}>
			{loading ? <Spin /> : error ? <Typography.Text type="danger">{error}</Typography.Text> : providers.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : <List dataSource={providers} renderItem={(provider) => <List.Item actions={[<Button key="add" size="small" onClick={() => void resolve(String(provider.providerId ?? provider.id))}>Add</Button>]}><List.Item.Meta title={String(provider.title ?? provider.id)} description={String(provider.description ?? "External plugin context")} /></List.Item>} />}
		</Modal>
	</>;
}
