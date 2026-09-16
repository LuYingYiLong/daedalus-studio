import { Badge, Button, Spin, Tooltip, Tree } from "antd";
import type { TreeProps } from "antd";
import type { DragEvent, Key, MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type {
	ConversationFlowSummary,
	FlowTreeOrder,
	FlowTreeSectionKey,
	FlowTreeOrderUpdate,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import { getWorkspaceIconStyle, WORKSPACE_ICON_NAMES } from "@/widgets/workspace/workspace-appearance";
import styles from "./FlowTree.module.css";

export type FlowTreeProps = {
	flows: ConversationFlowSummary[];
	workspaces: WorkspaceConfig[];
	selectedFlowId: string | null;
	isLoading: boolean;
	isMutating: boolean;
	order: FlowTreeOrder | null;
	onSelect: (flowId: string) => void;
	onArchive: (flow: ConversationFlowSummary) => void;
	onOrderUpdate: (order: FlowTreeOrderUpdate) => void;
};

type FlowTreeNode = {
	key: string;
	title: ReactNode;
	kind: "section" | "workspace" | "flow" | "empty";
	section?: FlowTreeSectionKey;
	workspaceId?: string;
	parentKey?: string;
	flow?: ConversationFlowSummary;
	children?: FlowTreeNode[];
	selectable?: boolean;
	disabled?: boolean;
	isLeaf?: boolean;
	className?: string;
};

const sectionKeys: readonly FlowTreeSectionKey[] = ["pinned", "projects", "recent"];

function flowKey(flowId: string): string {
	return `flow:${flowId}`;
}

function sectionKey(section: FlowTreeSectionKey): string {
	return `section:${section}`;
}

function workspaceKey(workspaceId: string): string {
	return `flow-workspace:${workspaceId}`;
}

function getFlowTreeWorkspaceIcon(workspace: WorkspaceConfig | undefined, expanded: boolean | undefined): React.JSX.Element {
	if (workspace === undefined) {
		return <Icon name={expanded === true ? "folder-open" : "folder"} />;
	}
	const configuredIconName: string = WORKSPACE_ICON_NAMES[workspace.icon] ?? "folder";
	const iconName: string = configuredIconName === "folder" && expanded === true ? "folder-open" : configuredIconName;
	return <Icon name={iconName} style={getWorkspaceIconStyle(workspace.color)} />;
}

function sortByUpdatedAt(flows: readonly ConversationFlowSummary[]): ConversationFlowSummary[] {
	return [...flows].sort((left, right): number => {
		const byTime: number = right.updatedAt.localeCompare(left.updatedAt);
		return byTime !== 0 ? byTime : left.flowId.localeCompare(right.flowId);
	});
}

function mergeFlowIds(
	orderedIds: readonly string[],
	candidates: readonly ConversationFlowSummary[],
	used: Set<string>,
): ConversationFlowSummary[] {
	const byId: ReadonlyMap<string, ConversationFlowSummary> = new Map(
		candidates.map((flow): [string, ConversationFlowSummary] => [flow.flowId, flow]),
	);
	const result: ConversationFlowSummary[] = [];
	for (const flowId of orderedIds) {
		const flow: ConversationFlowSummary | undefined = byId.get(flowId);
		if (flow !== undefined && !used.has(flow.flowId)) {
			used.add(flow.flowId);
			result.push(flow);
		}
	}
	const newFlows: ConversationFlowSummary[] = sortByUpdatedAt(candidates).filter((flow): boolean => !used.has(flow.flowId));
	for (const flow of newFlows) {
		if (!used.has(flow.flowId)) {
			used.add(flow.flowId);
		}
	}
	return [...newFlows, ...result];
}

function normalizeOrder(
	flows: readonly ConversationFlowSummary[],
	workspaces: readonly WorkspaceConfig[],
	order: FlowTreeOrder | null,
): FlowTreeOrderUpdate {
	const used: Set<string> = new Set();
	const pinnedFlows: ConversationFlowSummary[] = mergeFlowIds(
		order?.pinnedFlowIds ?? [],
		flows.filter((flow): boolean => flow.pinned),
		used,
	);
	const recentFlows: ConversationFlowSummary[] = mergeFlowIds(
		order?.recentFlowIds ?? [],
		flows.filter((flow): boolean => !flow.pinned && flow.workspaceId === null),
		used,
	);
	const workspaceIds: string[] = [
		...workspaces.map((workspace): string => workspace.id),
		...flows.flatMap((flow): string[] => flow.workspaceId === null ? [] : [flow.workspaceId]),
	].filter((workspaceId, index, all): boolean => all.indexOf(workspaceId) === index);
	const flowIdsByWorkspace: Record<string, string[]> = {};
	for (const workspaceId of workspaceIds) {
		const candidates: ConversationFlowSummary[] = flows.filter(
			(flow): boolean => !flow.pinned && flow.workspaceId === workspaceId,
		);
		flowIdsByWorkspace[workspaceId] = mergeFlowIds(
			order?.flowIdsByWorkspace[workspaceId] ?? [],
			candidates,
			used,
		).map((flow): string => flow.flowId);
	}
	return {
		pinnedFlowIds: pinnedFlows.map((flow): string => flow.flowId),
		recentFlowIds: recentFlows.map((flow): string => flow.flowId),
		flowIdsByWorkspace,
		expandedSectionKeys: order?.expandedSectionKeys ?? [...sectionKeys],
		expandedWorkspaceIds: order?.expandedWorkspaceIds ?? workspaceIds,
	};
}

type FlowBucket = {
	section: FlowTreeSectionKey;
	workspaceId?: string;
};

function bucketKey(bucket: FlowBucket): string {
	return bucket.section === "projects" ? `${bucket.section}:${bucket.workspaceId ?? ""}` : bucket.section;
}

function getBucketIds(order: FlowTreeOrderUpdate, bucket: FlowBucket): string[] {
	if (bucket.section === "pinned") return order.pinnedFlowIds;
	if (bucket.section === "recent") return order.recentFlowIds;
	return order.flowIdsByWorkspace[bucket.workspaceId ?? ""] ?? [];
}

function setBucketIds(order: FlowTreeOrderUpdate, bucket: FlowBucket, ids: string[]): void {
	if (bucket.section === "pinned") {
		order.pinnedFlowIds = ids;
	} else if (bucket.section === "recent") {
		order.recentFlowIds = ids;
	} else if (bucket.workspaceId !== undefined) {
		order.flowIdsByWorkspace[bucket.workspaceId] = ids;
	}
}

function bucketFromNode(node: FlowTreeNode): FlowBucket | null {
	if (node.section === undefined) return null;
	return node.section === "projects"
		? (node.workspaceId ?? (node.parentKey?.startsWith("flow-workspace:")
			? node.parentKey.slice("flow-workspace:".length)
			: undefined)) === undefined
			? null
			: { section: "projects", workspaceId: node.workspaceId ?? node.parentKey!.slice("flow-workspace:".length) }
		: { section: node.section };
}

function moveFlow(order: FlowTreeOrderUpdate, source: FlowBucket, destination: FlowBucket, sourceId: string, targetId: string | null, afterTarget: boolean): void {
	const sameBucket: boolean = bucketKey(source) === bucketKey(destination);
	const sourceIds: string[] = getBucketIds(order, source).filter((id): boolean => id !== sourceId);
	const destinationIds: string[] = sameBucket
		? sourceIds
		: getBucketIds(order, destination).filter((id): boolean => id !== sourceId);
	const targetIndex: number = targetId === null
		? destinationIds.length
		: Math.max(0, destinationIds.indexOf(targetId) + (afterTarget ? 1 : 0));
	destinationIds.splice(Math.min(targetIndex, destinationIds.length), 0, sourceId);
	setBucketIds(order, source, sourceIds);
	setBucketIds(order, destination, destinationIds);
}

function FlowTree({
	flows,
	workspaces,
	selectedFlowId,
	isLoading,
	isMutating,
	order,
	onSelect,
	onArchive,
	onOrderUpdate,
}: FlowTreeProps): React.JSX.Element {
	const { t } = useTranslation();
	const effectiveOrder: FlowTreeOrderUpdate = useMemo(
		(): FlowTreeOrderUpdate => normalizeOrder(flows, workspaces, order),
		[flows, order, workspaces],
	);
	const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

	useEffect((): void => {
		setExpandedKeys([
			...effectiveOrder.expandedSectionKeys.map(sectionKey),
			...effectiveOrder.expandedWorkspaceIds.map(workspaceKey),
		]);
	}, [effectiveOrder.expandedSectionKeys, effectiveOrder.expandedWorkspaceIds]);

	const treeData = useMemo<FlowTreeNode[]>(() => {
		const flowById: ReadonlyMap<string, ConversationFlowSummary> = new Map(
			flows.map((flow): [string, ConversationFlowSummary] => [flow.flowId, flow]),
		);
		const createFlowNode = (flowId: string, parentKey: string, section: FlowTreeSectionKey, workspaceId?: string): FlowTreeNode | null => {
			const flow: ConversationFlowSummary | undefined = flowById.get(flowId);
			if (flow === undefined) return null;
			return {
				key: flowKey(flow.flowId),
				kind: "flow",
				className: styles.flowNode,
				section,
				workspaceId,
				parentKey,
				flow,
				title: (
					<FlowTreeItem
						flow={flow}
						isSelected={flow.flowId === selectedFlowId}
						isMutating={isMutating}
						onArchive={onArchive}
					/>
				),
				isLeaf: true,
			};
		};
		const emptyNode = (key: string, section: FlowTreeSectionKey, parentKey: string): FlowTreeNode => ({
			key,
			kind: "empty",
			className: styles.emptyNode,
			section,
			parentKey,
			title: <span className={styles.emptyItem}>{t("flow.tree.empty")}</span>,
			selectable: false,
			disabled: true,
			isLeaf: true,
		});
		const createSectionNode = (section: FlowTreeSectionKey, children: FlowTreeNode[]): FlowTreeNode => ({
			key: sectionKey(section),
			kind: "section",
			className: styles.sectionNode,
			section,
			selectable: false,
			title: <span className={styles.groupTitle}>{t(`flow.tree.${section}`)}</span>,
			children: children.length > 0 ? children : [emptyNode(`${sectionKey(section)}:empty`, section, sectionKey(section))],
		});
		const pinnedChildren: FlowTreeNode[] = effectiveOrder.pinnedFlowIds.flatMap((flowId): FlowTreeNode[] => {
			const node = createFlowNode(flowId, sectionKey("pinned"), "pinned");
			return node === null ? [] : [node];
		});
		const recentChildren: FlowTreeNode[] = effectiveOrder.recentFlowIds.flatMap((flowId): FlowTreeNode[] => {
			const node = createFlowNode(flowId, sectionKey("recent"), "recent");
			return node === null ? [] : [node];
		});
		const workspaceNameById: ReadonlyMap<string, string> = new Map(
			workspaces.map((workspace): [string, string] => [workspace.id, workspace.name]),
		);
		const projectChildren: FlowTreeNode[] = Object.entries(effectiveOrder.flowIdsByWorkspace).map(
			([workspaceId, flowIds]): FlowTreeNode => {
				const parentKey: string = workspaceKey(workspaceId);
				const children: FlowTreeNode[] = flowIds.flatMap((flowId): FlowTreeNode[] => {
					const node = createFlowNode(flowId, parentKey, "projects", workspaceId);
					return node === null ? [] : [node];
				});
				return {
					key: parentKey,
					kind: "workspace",
					className: styles.workspaceNode,
					section: "projects",
					workspaceId,
					selectable: false,
					title: <span className={styles.groupTitle}>{workspaceNameById.get(workspaceId) ?? workspaceId}</span>,
					children: children.length > 0 ? children : [emptyNode(`${parentKey}:empty`, "projects", parentKey)],
				};
			},
		);
		return [
			createSectionNode("pinned", pinnedChildren),
			createSectionNode("projects", projectChildren),
			createSectionNode("recent", recentChildren),
		];
	}, [effectiveOrder.flowIdsByWorkspace, effectiveOrder.pinnedFlowIds, effectiveOrder.recentFlowIds, flows, isMutating, onArchive, selectedFlowId, t, workspaces]);

	const handleDrop: NonNullable<TreeProps<FlowTreeNode>["onDrop"]> = (info): void => {
		const dragNode: FlowTreeNode = info.dragNode as FlowTreeNode;
		const dropNode: FlowTreeNode = info.node as FlowTreeNode;
		if (dragNode.kind !== "flow" || dragNode.flow === undefined) return;
		const source = bucketFromNode(dragNode);
		const destination = bucketFromNode(dropNode);
		if (source === null || destination === null) return;
		if (destination.section === "recent" && dragNode.flow.workspaceId !== null) return;
		if (destination.section === "projects" && dragNode.flow.workspaceId !== destination.workspaceId) return;
		if (dropNode.kind === "section" && destination.section === "projects") return;
		const next: FlowTreeOrderUpdate = {
			pinnedFlowIds: [...effectiveOrder.pinnedFlowIds],
			recentFlowIds: [...effectiveOrder.recentFlowIds],
			flowIdsByWorkspace: Object.fromEntries(
				Object.entries(effectiveOrder.flowIdsByWorkspace).map(([key, value]): [string, string[]] => [key, [...value]]),
			),
			expandedSectionKeys: [...effectiveOrder.expandedSectionKeys],
			expandedWorkspaceIds: [...effectiveOrder.expandedWorkspaceIds],
		};
		const targetId: string | null = dropNode.kind === "flow" && dropNode.flow !== undefined ? dropNode.flow.flowId : null;
		moveFlow(next, source, destination, dragNode.flow.flowId, targetId, info.dropPosition > 0);
		onOrderUpdate(next);
	};

	if (isLoading && flows.length === 0) return <div className={styles.loading}><Spin size="small" /></div>;

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
				expandedKeys={expandedKeys}
				selectedKeys={selectedFlowId === null ? [] : [flowKey(selectedFlowId)]}
				draggable={{
					icon: false,
					nodeDraggable: (node): boolean => (node as FlowTreeNode).kind === "flow",
				}}
				allowDrop={({ dragNode, dropNode, dropPosition }): boolean => {
					const drag = dragNode as FlowTreeNode;
					const drop = dropNode as FlowTreeNode;
					if (drag.kind !== "flow" || drag.flow === undefined) return false;
					if (drop.kind === "section") {
						return drop.section === "pinned"
							|| (drop.section === "recent" && drag.flow.workspaceId === null);
					}
					if (drop.kind === "workspace" || drop.kind === "empty") {
						const workspaceId: string | undefined = drop.workspaceId ?? (drop.parentKey?.startsWith("flow-workspace:")
							? drop.parentKey.slice("flow-workspace:".length)
							: undefined);
						return drop.section === "projects" && drag.flow.workspaceId === workspaceId && (drop.kind === "empty" || dropPosition === 0);
					}
					if (drop.kind !== "flow" || drop.flow === undefined || dropPosition === 0) return false;
					return drag.section === drop.section && (drag.section !== "projects" || drag.flow.workspaceId === drop.flow.workspaceId);
				}}
				onExpand={(keys): void => {
					const nextExpandedKeys: string[] = keys.map(String);
					setExpandedKeys(nextExpandedKeys);
					onOrderUpdate({
						...effectiveOrder,
						expandedSectionKeys: nextExpandedKeys.flatMap((key): FlowTreeSectionKey[] => {
							const section = key.startsWith("section:") ? key.slice("section:".length) : "";
							return sectionKeys.includes(section as FlowTreeSectionKey) ? [section as FlowTreeSectionKey] : [];
						}),
						expandedWorkspaceIds: nextExpandedKeys.flatMap((key): string[] =>
							key.startsWith("flow-workspace:") ? [key.slice("flow-workspace:".length)] : [],
						),
					});
				}}
				onSelect={(_selectedKeys: Key[], info): void => {
					const node: FlowTreeNode = info.node as FlowTreeNode;
					if (node.kind === "flow" && node.flow !== undefined) onSelect(node.flow.flowId);
				}}
				onDrop={handleDrop}
				switcherIcon={(nodeProps): React.JSX.Element | null => {
					const node: FlowTreeNode = nodeProps as FlowTreeNode;
					if (node.kind === "section") {
						return <Icon name={nodeProps.expanded === true ? "arrow-down" : "arrow-forward"} />;
					}
					if (node.kind === "workspace") {
						return getFlowTreeWorkspaceIcon(
							workspaces.find((workspace): boolean => workspace.id === node.workspaceId),
							nodeProps.expanded,
						);
					}
					return null;
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
						<span className={styles.itemRunning} aria-label={t("flow.status.streaming")}><Spin size="small" /></span>
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
							onDragStart={(event: DragEvent<HTMLElement>): void => { event.preventDefault(); event.stopPropagation(); }}
							onClick={(event: MouseEvent<HTMLElement>): void => { event.preventDefault(); event.stopPropagation(); onArchive(flow); }}
						/>
					</Tooltip>
				)}
			</span>
		</span>
	);
}

export default FlowTree;
