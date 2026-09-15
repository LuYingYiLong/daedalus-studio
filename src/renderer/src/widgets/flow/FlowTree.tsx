import { Badge, Button, Empty, Spin, Tooltip, Tree } from "antd";
import type { DragEvent, Key, MouseEvent, ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { ConversationFlowSummary, WorkspaceConfig } from "@/platform/rpc/types";
import styles from "./FlowTree.module.css";

export type FlowTreeProps = {
	flows: ConversationFlowSummary[];
	workspaces: WorkspaceConfig[];
	selectedFlowId: string | null;
	isLoading: boolean;
	isMutating: boolean;
	onSelect: (flowId: string) => void;
	onArchive: (flow: ConversationFlowSummary) => void;
};

type FlowTreeNode = {
	key: string;
	title: ReactNode;
	kind: "workspace" | "flow";
	flow?: ConversationFlowSummary;
	children?: FlowTreeNode[];
	selectable?: boolean;
};

function FlowTree({
	flows,
	workspaces,
	selectedFlowId,
	isLoading,
	isMutating,
	onSelect,
	onArchive,
}: FlowTreeProps): React.JSX.Element {
	const { t } = useTranslation();
	const treeData = useMemo<FlowTreeNode[]>(() => {
		const workspaceNameById: Map<string, string> = new Map(workspaces.map((workspace): [string, string] => [workspace.id, workspace.name]));
		const grouped: Map<string, { label: string; flows: ConversationFlowSummary[] }> = new Map();
		for (const flow of flows) {
			const key: string = flow.workspaceId ?? "__unbound__";
			const group = grouped.get(key) ?? {
				label: flow.workspaceId === null ? t("flow.tree.unbound") : workspaceNameById.get(flow.workspaceId) ?? flow.workspaceId,
				flows: [],
			};
			group.flows.push(flow);
			grouped.set(key, group);
		}
		return [...grouped.entries()].map(([key, group]): FlowTreeNode => ({
			key: `workspace:${key}`,
			kind: "workspace",
			selectable: false,
			title: <span className={styles.groupTitle}>{group.label}</span>,
			children: group.flows.map((flow): FlowTreeNode => ({
				key: flow.flowId,
				kind: "flow",
				flow,
				title: (
					<FlowTreeItem
						flow={flow}
						isSelected={flow.flowId === selectedFlowId}
						isMutating={isMutating}
						onArchive={onArchive}
					/>
				),
			})),
		}));
	}, [flows, isMutating, onArchive, selectedFlowId, t, workspaces]);

	if (isLoading && flows.length === 0) return <div className={styles.loading}><Spin size="small" /></div>;
	if (flows.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("flow.tree.empty")} className={styles.empty} />;

	return (
		<div className={styles.tree}>
			<Tree<FlowTreeNode>
				aria-label={t("flow.tree.label")}
				blockNode
				virtual={false}
				classNames={{
					root: styles.treeRoot,
					item: styles.treeItem,
					itemTitle: styles.treeItemTitle,
					itemSwitcher: styles.treeItemSwitcher,
				}}
				treeData={treeData}
				defaultExpandedKeys={treeData.map((node): string => node.key)}
				selectedKeys={selectedFlowId === null ? [] : [selectedFlowId]}
				onSelect={(_selectedKeys: Key[], info): void => {
					const node: FlowTreeNode = info.node;
					if (node.kind === "flow" && node.flow !== undefined) onSelect(node.flow.flowId);
				}}
			/>
		</div>
	);
}

type FlowTreeItemProps = {
	flow: ConversationFlowSummary;
	isSelected: boolean;
	isMutating: boolean;
	onArchive: (flow: ConversationFlowSummary) => void;
};

function FlowTreeItem({ flow, isSelected, isMutating, onArchive }: FlowTreeItemProps): React.JSX.Element {
	const { t } = useTranslation();
	const isRunning: boolean = flow.activeRequestId !== null;
	return (
		<span className={`${styles.item} ${isSelected ? styles.itemSelected : ""}`} data-running={isRunning ? "true" : undefined}>
			<Icon name="workflow" />
			<span className={styles.itemTitle}>{flow.title}</span>
			<Badge count={flow.branchCount} overflowCount={99} className={styles.itemBadge} />
			<span className={styles.itemEndSlot}>
				{isRunning ? (
					<Tooltip title={t("flow.status.streaming")}>
						<span className={styles.itemRunning} aria-label={t("flow.status.streaming")}>
							<Spin size="small" />
						</span>
					</Tooltip>
				) : (
					<Tooltip title={t("flow.actions.archive")}>
						<Button
							type="text"
							shape="circle"
							size="small"
							aria-label={`${t("flow.actions.archive")}: ${flow.title}`}
							className={styles.archiveButton}
							icon={<Icon name="archive" />}
							loading={isMutating && isSelected}
							draggable={false}
							onMouseDown={(event: MouseEvent<HTMLElement>): void => event.stopPropagation()}
							onDragStart={(event: DragEvent<HTMLElement>): void => {
								event.preventDefault();
								event.stopPropagation();
							}}
							onClick={(event: MouseEvent<HTMLElement>): void => {
								event.preventDefault();
								event.stopPropagation();
								onArchive(flow);
							}}
						/>
					</Tooltip>
				)}
			</span>
		</span>
	);
}

export default FlowTree;
