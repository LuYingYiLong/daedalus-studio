import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import styles from "./McpServersSettingsPage.module.css";
import { Alert, Button, Empty, Form, Input, Modal, Select, Space, Spin, Switch, Tag, Tooltip, Typography } from "antd";
import { Icon } from "@/assets/icons";
import TextArea from "antd/es/input/TextArea";
import {
	addMcpServer,
	fetchMcpConfig,
	removeMcpServer,
	setMcpServerEnabled,
	type CustomMcpServer,
	type McpConfigListResult,
	type McpRuntimeStatus,
	type McpTransport
} from "@/api/mcp-api";
import { createMcpServerAddPayload, type McpServerFormValues } from "./mcp-form-utils";

const DEFAULT_FORM_VALUES: McpServerFormValues = {
	transport: "stdio"
};

function getStatusColor(status: McpRuntimeStatus): string {
	if (status === "connected") {
		return "success";
	}
	if (status === "failed") {
		return "error";
	}
	if (status === "disabled") {
		return "default";
	}
	return "processing";
}

function getServerSummary(server: CustomMcpServer): string {
	if (server.transport === "stdio") {
		return [server.command, ...server.args].filter((part: string | null): part is string => typeof part === "string" && part.length > 0).join(" ");
	}
	return server.url ?? "";
}

function getSecretSummary(server: CustomMcpServer): string {
	const names: string[] = server.transport === "stdio" ? server.envNames : server.headerNames;
	return names.length === 0 ? "No secrets" : names.join(", ");
}

function applyConfigResult(result: McpConfigListResult, setServers: (servers: CustomMcpServer[]) => void, setErrorMessage: (message: string | null) => void): void {
	setServers(result.customMcpServers);
	setErrorMessage(result.error ?? null);
}

function McpServersSettingsPage(): React.JSX.Element {
	const [form] = Form.useForm<McpServerFormValues>();
	const [addMcpServerOpen, setAddMcpServerOpen] = useState<boolean>(false);
	const [servers, setServers] = useState<CustomMcpServer[]>([]);
	const [query, setQuery] = useState<string>("");
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [busyServerId, setBusyServerId] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const transport: McpTransport = Form.useWatch("transport", form) ?? "stdio";

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadMcpServers(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);
				const result: McpConfigListResult = await fetchMcpConfig();
				if (!cancelled) {
					applyConfigResult(result, setServers, setErrorMessage);
				}
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : "Failed to load MCP servers");
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		void loadMcpServers();

		return (): void => {
			cancelled = true;
		};
	}, []);

	const filteredServers: CustomMcpServer[] = useMemo((): CustomMcpServer[] => {
		const normalizedQuery: string = query.trim().toLowerCase();
		if (normalizedQuery.length === 0) {
			return servers;
		}
		return servers.filter((server: CustomMcpServer): boolean => {
			return server.name.toLowerCase().includes(normalizedQuery)
				|| server.description.toLowerCase().includes(normalizedQuery)
				|| getServerSummary(server).toLowerCase().includes(normalizedQuery);
		});
	}, [query, servers]);

	function openAddModal(): void {
		form.resetFields();
		form.setFieldsValue(DEFAULT_FORM_VALUES);
		setAddMcpServerOpen(true);
	}

	function handleTransportChange(nextTransport: McpTransport): void {
		form.setFieldsValue(nextTransport === "stdio"
			? { transport: nextTransport, url: undefined, headers: undefined }
			: { transport: nextTransport, command: undefined, args: undefined, env: undefined });
	}

	async function handleSubmitAdd(): Promise<void> {
		try {
			setIsSaving(true);
			setErrorMessage(null);
			const values: McpServerFormValues = await form.validateFields();
			const result = await addMcpServer(createMcpServerAddPayload(values));
			applyConfigResult(result, setServers, setErrorMessage);
			setAddMcpServerOpen(false);
			form.resetFields();
		} catch (error: unknown) {
			if (error instanceof Error) {
				setErrorMessage(error.message);
			}
		} finally {
			setIsSaving(false);
		}
	}

	async function handleSetEnabled(server: CustomMcpServer, enabled: boolean): Promise<void> {
		try {
			setBusyServerId(server.id);
			setErrorMessage(null);
			const result = await setMcpServerEnabled(server.id, enabled);
			applyConfigResult(result, setServers, setErrorMessage);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to update MCP server");
		} finally {
			setBusyServerId(null);
		}
	}

	function confirmDelete(server: CustomMcpServer): void {
		Modal.confirm({
			title: "Delete MCP server?",
			content: `Delete ${server.name} from Daedalus Studio. Stored secrets for this MCP server will also be removed.`,
			okText: "Delete",
			okButtonProps: { danger: true },
			async onOk(): Promise<void> {
				try {
					setBusyServerId(server.id);
					setErrorMessage(null);
					const result = await removeMcpServer(server.id);
					applyConfigResult(result, setServers, setErrorMessage);
				} catch (error: unknown) {
					setErrorMessage(error instanceof Error ? error.message : "Failed to delete MCP server");
				} finally {
					setBusyServerId(null);
				}
			}
		});
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<Typography.Title level={3} className={styles.title}>
						MCP Servers
					</Typography.Title>
					<Tag>{servers.length}</Tag>
				</div>
				<Space.Compact className={styles.spaceCompact}>
					<Input
						allowClear={true}
						prefix={<Icon name="search" />}
						placeholder="Search MCP..."
						className={styles.searchBox}
						value={query}
						onChange={(event: ChangeEvent<HTMLInputElement>): void => setQuery(event.target.value)}
					/>
					<Button
						icon={<Icon name="add" />}
						onClick={openAddModal}
					>
						Add
					</Button>
				</Space.Compact>
			</header>

			{errorMessage !== null ? (
				<Alert
					type="warning"
					showIcon={true}
					description={errorMessage}
					closable={{
						onClose: (): void => setErrorMessage(null)
					}}
				/>
			) : null}

			<div className={styles.serverList}>
				{isLoading ? (
					<Spin />
				) : filteredServers.length === 0 ? (
					<Empty
						image={<Icon name="empty" />}
						description={servers.length === 0 ? "No custom MCP servers" : "No matching MCP servers"}
					/>
				) : filteredServers.map((server: CustomMcpServer): React.JSX.Element => {
					const isBusy: boolean = busyServerId === server.id;
					return (
						<div key={server.id} className={styles.mcpServerItem}>
							<div className={styles.serverMain}>
								<div className={styles.serverTitleRow}>
									<Typography.Title level={4} className={styles.serverTitle}>{server.name}</Typography.Title>
									<Tag>{server.transport.toUpperCase()}</Tag>
									<Tag color={getStatusColor(server.status)}>{server.status}</Tag>
									{server.enabled ? <Tag color="success">ON</Tag> : <Tag>OFF</Tag>}
								</div>
								{server.description.length > 0 ? (
									<Typography.Text type="secondary" className={styles.serverDescription}>{server.description}</Typography.Text>
								) : null}
								<Typography.Text className={styles.serverSummary}>{getServerSummary(server)}</Typography.Text>
								<Typography.Text type="secondary" className={styles.serverMeta}>
									Tools {server.toolCount} · {getSecretSummary(server)}
									{server.error !== null ? ` · ${server.error}` : ""}
								</Typography.Text>
							</div>
							<div className={styles.serverActions}>
								<Tooltip title={server.enabled ? "Disable" : "Enable"}>
									<Switch
										checked={server.enabled}
										loading={isBusy}
										disabled={busyServerId !== null && !isBusy}
										onChange={(checked: boolean): void => {
											void handleSetEnabled(server, checked);
										}}
									/>
								</Tooltip>
								<Button
									type="text"
									danger={true}
									icon={<Icon name="remove" />}
									loading={isBusy}
									disabled={busyServerId !== null && !isBusy}
									onClick={(): void => confirmDelete(server)}
								>
									Delete
								</Button>
							</div>
						</div>
					);
				})}
			</div>

			<Modal
				title="Add MCP server"
				centered={true}
				open={addMcpServerOpen}
				onCancel={(): void => setAddMcpServerOpen(false)}
				onOk={(): void => {
					void handleSubmitAdd();
				}}
				okText="Add"
				confirmLoading={isSaving}
				destroyOnHidden={true}
			>
				<Form<McpServerFormValues>
					form={form}
					layout="vertical"
					initialValues={DEFAULT_FORM_VALUES}
				>
					<Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
						<Input placeholder="MCP server name" />
					</Form.Item>
					<Form.Item label="Description" name="description">
						<TextArea rows={3} placeholder="MCP server description" />
					</Form.Item>
					<Form.Item label="Type" name="transport" rules={[{ required: true }]}>
						<Select
							value={transport}
							onChange={handleTransportChange}
							options={[
								{ value: "stdio", label: "STDIO" },
								{ value: "http", label: "HTTP" }
							]}
						/>
					</Form.Item>
					{transport === "stdio" ? (
						<>
							<Form.Item label="Command" name="command" rules={[{ required: true, message: "Command is required" }]}>
								<Input placeholder="npx or uvx" />
							</Form.Item>
							<Form.Item label="Args" name="args">
								<TextArea rows={3} placeholder={`arg1\narg2`} />
							</Form.Item>
							<Form.Item label="Env" name="env">
								<TextArea rows={3} placeholder={`KEY1=value1\nKEY2=value2`} />
							</Form.Item>
						</>
					) : (
						<>
							<Form.Item label="URL" name="url" rules={[{ required: true, type: "url", message: "A valid URL is required" }]}>
								<Input placeholder="https://mcp.example.com/mcp" />
							</Form.Item>
							<Form.Item label="HTTP Header" name="headers">
								<TextArea rows={3} placeholder={`Authorization: Bearer your_token_here\nContent-Type: application/json`} />
							</Form.Item>
						</>
					)}
				</Form>
			</Modal>
		</section>
	);
}

export default McpServersSettingsPage;
