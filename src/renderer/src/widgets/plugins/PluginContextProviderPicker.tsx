import { Button, List, Modal, Spin, Tooltip, Typography } from "antd";
import React from "react";
import { listPluginContextProviders, resolvePluginContextProvider } from "@/platform/rpc/plugin-extensions-api";
import { Icon } from "@/assets/icons";

type PluginContextProviderPickerProps = {
	onAddContext?: (value: Record<string, unknown>) => void;
};

export default function PluginContextProviderPicker({ onAddContext }: PluginContextProviderPickerProps): React.JSX.Element | null {
	const [open, setOpen] = React.useState(false);
	const [loading, setLoading] = React.useState(false);
	const [providers, setProviders] = React.useState<Array<Record<string, unknown>> | null>(null);
	const [error, setError] = React.useState<string | null>(null);

	const refreshProviders = React.useCallback(async (): Promise<Array<Record<string, unknown>>> => {
		setLoading(true);
		setError(null);
		try {
			const nextProviders: Array<Record<string, unknown>> = (await listPluginContextProviders()).providers;
			setProviders(nextProviders);
			return nextProviders;
		} catch (cause: unknown) {
			setProviders([]);
			setError(cause instanceof Error ? cause.message : "Unable to load providers");
			return [];
		} finally {
			setLoading(false);
		}
	}, []);

	React.useEffect((): (() => void) => {
		void refreshProviders();
		const handleWindowFocus = (): void => {
			void refreshProviders();
		};
		window.addEventListener("focus", handleWindowFocus);
		return (): void => {
			window.removeEventListener("focus", handleWindowFocus);
		};
	}, [refreshProviders]);

	async function openPicker(): Promise<void> {
		setOpen(true);
		const nextProviders: Array<Record<string, unknown>> = await refreshProviders();
		if (nextProviders.length === 0) {
			setOpen(false);
		}
	}

	async function resolve(providerId: string): Promise<void> {
		setLoading(true);
		setError(null);
		try {
			onAddContext?.(await resolvePluginContextProvider(providerId));
			setOpen(false);
		} catch (cause: unknown) {
			setError(cause instanceof Error ? cause.message : "Unable to resolve provider");
		} finally {
			setLoading(false);
		}
	}

	// Provider 为空或尚未加载时不渲染入口，避免 Composer 出现无效按钮。
	if (providers === null || providers.length === 0) {
		return null;
	}

	return <>
			<Tooltip title="Add plugin context">
				<Button type="text" shape="circle" aria-label="Add plugin context" icon={<Icon name="plugin" />} onClick={() => void openPicker()} />
			</Tooltip>
			<Modal open={open} title="Plugin context" footer={null} onCancel={() => setOpen(false)}>
				{loading ? <Spin /> : error ? <Typography.Text type="danger">{error}</Typography.Text> : <List dataSource={providers} renderItem={(provider) => <List.Item actions={[<Button key="add" size="small" onClick={() => void resolve(String(provider.providerId ?? provider.id))}>Add</Button>]}><List.Item.Meta title={String(provider.title ?? provider.id)} description={String(provider.description ?? "External plugin context")} /></List.Item>} />}
			</Modal>
		</>;
}
