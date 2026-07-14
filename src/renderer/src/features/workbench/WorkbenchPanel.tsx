import { useEffect, useState } from "react";
import { Alert, Button, List, Space, Tabs, Tag, Typography } from "antd";
import type { TabsProps } from "antd";
import type { AdditionalContextItem, WorkspaceConfig, WorkbenchNextStepHint, WorkbenchSnapshot } from "@/api/types";
import styles from "./WorkbenchPanel.module.css";

type WorkspaceFsEntry = {
	name: string;
	relativePath: string;
	resourcePath: string;
	kind: "file" | "folder";
};

export type WorkbenchPanelProps = {
	open: boolean;
	workbench: WorkbenchSnapshot | null;
	activeWorkspace: WorkspaceConfig | null;
	onClose: () => void;
	onAddContext: (item: AdditionalContextItem) => void;
	onRemoveContext: (contextId: string) => void;
	onPinContext: (contextId: string, pinned: boolean) => void;
	onClearUnpinnedContext: () => void;
	onClearHints: () => void;
	onApprove: (approvalId: string) => void;
	onReject: (approvalId: string) => void;
};

function createFilesystemContext(entry: WorkspaceFsEntry): AdditionalContextItem {
	return {
		id: `studio-filesystem:${entry.resourcePath}`,
		kind: "filesystem_selection",
		title: entry.name,
		subtitle: entry.resourcePath,
		source: "manual",
		resourcePath: entry.resourcePath,
		data: {
			selectedPaths: [
				{
					kind: entry.kind,
					resourcePath: entry.resourcePath
				}
			]
		}
	};
}

function getHintText(hint: WorkbenchNextStepHint): string {
	return hint.text ?? hint.message ?? hint.title ?? "Next step";
}

function ContextTab({
	workbench,
	activeWorkspace,
	onAddContext,
	onRemoveContext,
	onPinContext,
	onClearUnpinnedContext
}: Pick<WorkbenchPanelProps, "workbench" | "activeWorkspace" | "onAddContext" | "onRemoveContext" | "onPinContext" | "onClearUnpinnedContext">): React.JSX.Element {
	const [relativePath, setRelativePath] = useState<string>("");
	const [entries, setEntries] = useState<WorkspaceFsEntry[]>([]);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const contexts: AdditionalContextItem[] = workbench?.composer.additionalContext ?? [];

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadEntries(): Promise<void> {
			if (activeWorkspace === null) {
				setEntries([]);
				return;
			}

			try {
				setErrorMessage(null);
				const result = await window.electronAPI.workspaceFs.listChildren({
					workspaceRoot: activeWorkspace.rootPath,
					relativePath
				});

				if (!cancelled) {
					setEntries(result.entries);
				}
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : "加载工作区文件失败");
				}
			}
		}

		void loadEntries();

		return (): void => {
			cancelled = true;
		};
	}, [activeWorkspace, relativePath]);

	function goParent(): void {
		const parts: string[] = relativePath.split("/").filter((part: string): boolean => part.length > 0);
		parts.pop();
		setRelativePath(parts.join("/"));
	}

	return (
		<div className={styles.tabContent}>
			<section className={styles.section}>
				<div className={styles.sectionHeader}>
					<Typography.Text strong={true}>Composer context</Typography.Text>
					<Button size="small" type="text" onClick={onClearUnpinnedContext}>Clear unpinned</Button>
				</div>
				{contexts.length === 0 ? (
					<Typography.Text type="secondary">No context attached.</Typography.Text>
				) : (
					<List
						size="small"
						dataSource={contexts}
						renderItem={(item: AdditionalContextItem): React.ReactNode => (
							<List.Item
								actions={[
									<Button key="pin" size="small" type="text" onClick={(): void => onPinContext(item.id, item.pinned !== true)}>
										{item.pinned === true ? "Unpin" : "Pin"}
									</Button>,
									<Button key="remove" size="small" type="text" danger={true} onClick={(): void => onRemoveContext(item.id)}>
										Remove
									</Button>
								]}
							>
								<List.Item.Meta
									title={item.title}
									description={item.subtitle ?? item.resourcePath}
								/>
							</List.Item>
						)}
					/>
				)}
			</section>

			<section className={styles.section}>
				<div className={styles.sectionHeader}>
					<Typography.Text strong={true}>Workspace files</Typography.Text>
					<Space size={4}>
						<Tag>{relativePath.length === 0 ? "res://" : `res://${relativePath}`}</Tag>
						<Button size="small" type="text" disabled={relativePath.length === 0} onClick={goParent}>Up</Button>
					</Space>
				</div>
				{activeWorkspace === null ? (
					<Alert type="info" showIcon={true} title="Select a workspace first." />
				) : errorMessage ? (
					<Alert type="error" showIcon={true} title={errorMessage} />
				) : (
					<List
						size="small"
						dataSource={entries}
						renderItem={(entry: WorkspaceFsEntry): React.ReactNode => (
							<List.Item
								actions={[
									entry.kind === "folder" ? (
										<Button key="open" size="small" type="text" onClick={(): void => setRelativePath(entry.relativePath)}>Open</Button>
									) : null,
									<Button key="add" size="small" type="text" onClick={(): void => onAddContext(createFilesystemContext(entry))}>Add</Button>
								].filter(Boolean)}
							>
								<List.Item.Meta title={entry.name} description={`${entry.kind} · ${entry.resourcePath}`} />
							</List.Item>
						)}
					/>
				)}
			</section>
		</div>
	);
}

function WorkbenchPanel({
	open,
	workbench,
	activeWorkspace,
	onClose,
	onAddContext,
	onRemoveContext,
	onPinContext,
	onClearUnpinnedContext,
	onClearHints,
	onApprove,
	onReject
}: WorkbenchPanelProps): React.JSX.Element | null {
	if (!open) {
		return null;
	}

	const activeRun = workbench?.activeRun;
	const pendingApproval = workbench?.pendingApproval;
	const tabs: TabsProps["items"] = [
		{
			key: "context",
			label: "Context",
			children: (
				<ContextTab
					workbench={workbench}
					activeWorkspace={activeWorkspace}
					onAddContext={onAddContext}
					onRemoveContext={onRemoveContext}
					onPinContext={onPinContext}
					onClearUnpinnedContext={onClearUnpinnedContext}
				/>
			)
		},
		{
			key: "queue",
			label: "Queue",
			children: (
				<List
					size="small"
					dataSource={workbench?.messageQueue ?? []}
					locale={{ emptyText: "No queued messages" }}
					renderItem={(item): React.ReactNode => (
						<List.Item>
							<List.Item.Meta title={item.text ?? item.message ?? item.id} description={item.status ?? item.mode} />
						</List.Item>
					)}
				/>
			)
		},
		{
			key: "run",
			label: "Run",
			children: (
				<div className={styles.tabContent}>
					<Typography.Text>Status: {activeRun?.status ?? "idle"}</Typography.Text>
					{activeRun?.requestId ? <Typography.Text type="secondary">Request: {activeRun.requestId}</Typography.Text> : null}
					{activeRun?.startedAt ? <Typography.Text type="secondary">Started: {activeRun.startedAt}</Typography.Text> : null}
				</div>
			)
		},
		{
			key: "approval",
			label: "Approval",
			children: pendingApproval?.approvalId ? (
				<div className={styles.tabContent}>
					<Alert
						type="warning"
						showIcon={true}
						title={pendingApproval.llmToolName ?? pendingApproval.toolName ?? "Approval required"}
						description={pendingApproval.reason}
					/>
					<Space>
						<Button type="primary" onClick={(): void => onApprove(pendingApproval.approvalId!)}>Approve</Button>
						<Button danger={true} onClick={(): void => onReject(pendingApproval.approvalId!)}>Reject</Button>
					</Space>
				</div>
			) : (
				<Typography.Text type="secondary">No pending approval.</Typography.Text>
			)
		},
		{
			key: "hints",
			label: "Hints",
			children: (
				<div className={styles.tabContent}>
					<div className={styles.sectionHeader}>
						<Typography.Text strong={true}>Next steps</Typography.Text>
						<Button size="small" type="text" onClick={onClearHints}>Clear</Button>
					</div>
					<List
						size="small"
						dataSource={workbench?.nextStepHints.hints ?? []}
						locale={{ emptyText: "No hints" }}
						renderItem={(hint: WorkbenchNextStepHint): React.ReactNode => (
							<List.Item>{getHintText(hint)}</List.Item>
						)}
					/>
				</div>
			)
		}
	];

	return (
		<aside className={styles.panel}>
			<header className={styles.header}>
				<Typography.Title level={5} className={styles.title}>Workbench</Typography.Title>
				<Button type="text" size="small" onClick={onClose}>Close</Button>
			</header>
			<Tabs className={styles.tabs} items={tabs} />
		</aside>
	);
}

export default WorkbenchPanel;
