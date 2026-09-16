import { Badge, Button, Spin, Tooltip, Tree } from "antd";
import type { TreeProps } from "antd";
import type { DragEvent, Key, MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
	title?: ReactNode;
	flowId?: string;
	kind: "section" | "workspace" | "flow" | "empty";
	section?: FlowTreeSectionKey;
	workspaceId?: string;
	parentKey?: string;
	children?: FlowTreeNode[];
	selectable?: boolean;
	disabled?: boolean;
	isLeaf?: boolean;
	className?: string;
};

const sectionKeys: readonly FlowTreeSectionKey[] = ["pinned", "projects", "recent"];

function sameExpandedKeySet(left: readonly string[], right: readonly string[]): boolean {
	if (left.length !== right.length) return false;
	const rightSet: ReadonlySet<string> = new Set(right);
	return left.every((key): boolean => rightSet.has(key));
}

function flowKey(flowId: string): string {
	return `flow:${flowId}`;
}

function sectionKey(section: FlowTreeSectionKey): string {
	return `section:${section}`;
}

function workspaceKey(workspaceId: string): string {
	return `flow-workspace:${workspaceId}`;
}

function getFlowTreeWorkspaceIcon(
	workspace: WorkspaceConfig | undefined,
	expanded: boolean | undefined,
): React.JSX.Element {
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
	const newFlows: ConversationFlowSummary[] = sortByUpdatedAt(candidates).filter(
		(flow): boolean => !used.has(flow.flowId),
	);
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
		...flows.flatMap((flow): string[] => (flow.workspaceId === null ? [] : [flow.workspaceId])),
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
		? (node.workspaceId ??
				(node.parentKey?.startsWith("flow-workspace:")
					? node.parentKey.slice("flow-workspace:".length)
					: undefined)) === undefined
			? null
			: { section: "projects", workspaceId: node.workspaceId ?? node.parentKey!.slice("flow-workspace:".length) }
		: { section: node.section };
}

function moveFlow(
	order: FlowTreeOrderUpdate,
	source: FlowBucket,
	destination: FlowBucket,
	sourceId: string,
	targetId: string | null,
	afterTarget: boolean,
): void {
	const sameBucket: boolean = bucketKey(source) === bucketKey(destination);
	const sourceIds: string[] = getBucketIds(order, source).filter((id): boolean => id !== sourceId);
	const destinationIds: string[] = sameBucket
		? sourceIds
		: getBucketIds(order, destination).filter((id): boolean => id !== sourceId);
	const targetIndex: number =
		targetId === null
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
	const flowById: ReadonlyMap<string, ConversationFlowSummary> = useMemo(
		(): ReadonlyMap<string, ConversationFlowSummary> =>
			new Map(flows.map((flow): [string, ConversationFlowSummary] => [flow.flowId, flow])),
		[flows],
	);
	const workspaceById: ReadonlyMap<string, WorkspaceConfig> = useMemo(
		(): ReadonlyMap<string, WorkspaceConfig> =>
			new Map(workspaces.map((workspace): [string, WorkspaceConfig] => [workspace.id, workspace])),
		[workspaces],
	);
	const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
	const expandedKeysRef = useRef(expandedKeys);
	const expansionSaveTimerRef = useRef<number | null>(null);
	const effectiveOrderRef = useRef(effectiveOrder);
	const onOrderUpdateRef = useRef(onOrderUpdate);
	expandedKeysRef.current = expandedKeys;
	effectiveOrderRef.current = effectiveOrder;
	onOrderUpdateRef.current = onOrderUpdate;

	function getExpandedOrder(keys: readonly string[]): Pick<FlowTreeOrderUpdate, "expandedSectionKeys" | "expandedWorkspaceIds"> {
		return {
			expandedSectionKeys: keys.flatMap((key): FlowTreeSectionKey[] => {
				const section = key.startsWith("section:") ? key.slice("section:".length) : "";
				return sectionKeys.includes(section as FlowTreeSectionKey) ? [section as FlowTreeSectionKey] : [];
			}),
			expandedWorkspaceIds: keys.flatMap((key): string[] =>
				key.startsWith("flow-workspace:") ? [key.slice("flow-workspace:".length)] : [],
			),
		};
	}

	function clearScheduledExpansionSave(): void {
		if (expansionSaveTimerRef.current !== null) {
			window.clearTimeout(expansionSaveTimerRef.current);
			expansionSaveTimerRef.current = null;
		}
	}

	function scheduleExpandedOrderSave(): void {
		clearScheduledExpansionSave();
		expansionSaveTimerRef.current = window.setTimeout((): void => {
			expansionSaveTimerRef.current = null;
			onOrderUpdateRef.current({
				...effectiveOrderRef.current,
				...getExpandedOrder(expandedKeysRef.current),
			});
		}, 300);
	}

	// Keep local expansion state authoritative while its debounced preference write is pending
	useEffect((): void => {
		if (expansionSaveTimerRef.current !== null) return;
		const nextExpandedKeys: string[] = [
			...effectiveOrder.expandedSectionKeys.map(sectionKey),
			...effectiveOrder.expandedWorkspaceIds.map(workspaceKey),
		];
		if (sameExpandedKeySet(expandedKeysRef.current, nextExpandedKeys)) return;
		expandedKeysRef.current = nextExpandedKeys;
		setExpandedKeys(nextExpandedKeys);
	}, [effectiveOrder.expandedSectionKeys, effectiveOrder.expandedWorkspaceIds]);

	useEffect((): (() => void) => (): void => {
		if (expansionSaveTimerRef.current === null) return;
		clearScheduledExpansionSave();
		onOrderUpdateRef.current({
			...effectiveOrderRef.current,
			...getExpandedOrder(expandedKeysRef.current),
		});
	}, []);

	const treeDataSignature: string = JSON.stringify({
		pinnedFlowIds: effectiveOrder.pinnedFlowIds,
		recentFlowIds: effectiveOrder.recentFlowIds,
		flowIdsByWorkspace: effectiveOrder.flowIdsByWorkspace,
		workspaceIds: workspaces.map((workspace): string => workspace.id),
	});
	const treeDataInputRef = useRef(effectiveOrder);
	treeDataInputRef.current = effectiveOrder;

	const treeData = useMemo<FlowTreeNode[]>(() => {
		// 只在节点结构变化时重建树，行内容由 titleRender 根据最新状态渲染
		const currentOrder: FlowTreeOrderUpdate = treeDataInputRef.current;
		const createFlowNode = (
			flowId: string,
			parentKey: string,
			section: FlowTreeSectionKey,
			workspaceId?: string,
		): FlowTreeNode => ({
			key: flowKey(flowId),
			kind: "flow",
			className: `${styles.flowNode} ${section === "projects" ? styles.flowProjectNode : ""}`.trim(),
			section,
			workspaceId,
			parentKey,
			flowId,
			isLeaf: true,
		});
		const emptyNode = (key: string, section: FlowTreeSectionKey, parentKey: string): FlowTreeNode => ({
			key,
			kind: "empty",
			className: [
				styles.emptyNode,
				section === "projects" && parentKey.startsWith("flow-workspace:")
					? styles.emptyProjectNode
					: "",
				section !== "projects" ? styles.emptySectionNode : "",
			]
				.filter(Boolean)
				.join(" "),
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
			children:
				children.length > 0
					? children
					: [emptyNode(`${sectionKey(section)}:empty`, section, sectionKey(section))],
		});
		const pinnedChildren: FlowTreeNode[] = currentOrder.pinnedFlowIds.map(
			(flowId): FlowTreeNode => createFlowNode(flowId, sectionKey("pinned"), "pinned"),
		);
		const recentChildren: FlowTreeNode[] = currentOrder.recentFlowIds.map(
			(flowId): FlowTreeNode => createFlowNode(flowId, sectionKey("recent"), "recent"),
		);
		const projectChildren: FlowTreeNode[] = Object.entries(currentOrder.flowIdsByWorkspace).map(
			([workspaceId, flowIds]): FlowTreeNode => {
				const parentKey: string = workspaceKey(workspaceId);
				const children: FlowTreeNode[] = flowIds.map(
					(flowId): FlowTreeNode => createFlowNode(flowId, parentKey, "projects", workspaceId),
				);
				return {
					key: parentKey,
					kind: "workspace",
					className: styles.workspaceNode,
					section: "projects",
					workspaceId,
					children: children.length > 0 ? children : [emptyNode(`${parentKey}:empty`, "projects", parentKey)],
				};
			},
		);
		return [
			createSectionNode("pinned", pinnedChildren),
			createSectionNode("projects", projectChildren),
			createSectionNode("recent", recentChildren),
		];
	}, [t, treeDataSignature]);
	const handleDrop: NonNullable<TreeProps<FlowTreeNode>["onDrop"]> = (info): void => {
		const dragNode: FlowTreeNode = info.dragNode as FlowTreeNode;
		const dropNode: FlowTreeNode = info.node as FlowTreeNode;
		if (dragNode.kind !== "flow" || dragNode.flowId === undefined) return;
		const source = bucketFromNode(dragNode);
		const destination = bucketFromNode(dropNode);
		if (source === null || destination === null) return;
		const dragFlow: ConversationFlowSummary | undefined = flowById.get(dragNode.flowId);
		if (dragFlow === undefined) return;
		if (destination.section === "recent" && dragFlow.workspaceId !== null) return;
		if (destination.section === "projects" && dragFlow.workspaceId !== destination.workspaceId) return;
		if (dropNode.kind === "section" && destination.section === "projects") return;
		const next: FlowTreeOrderUpdate = {
			pinnedFlowIds: [...effectiveOrder.pinnedFlowIds],
			recentFlowIds: [...effectiveOrder.recentFlowIds],
			flowIdsByWorkspace: Object.fromEntries(
				Object.entries(effectiveOrder.flowIdsByWorkspace).map(([key, value]): [string, string[]] => [
					key,
					[...value],
				]),
			),
			...getExpandedOrder(expandedKeysRef.current),
		};
		const targetId: string | null = dropNode.kind === "flow" ? (dropNode.flowId ?? null) : null;
		moveFlow(next, source, destination, dragFlow.flowId, targetId, info.dropPosition > 0);
		clearScheduledExpansionSave();
		onOrderUpdate(next);
	};

	if (isLoading && flows.length === 0)
		return (
			<div className={styles.loading}>
				<Spin size="small" />
			</div>
		);

	return (
		<div className={styles.tree}>
			<Tree<FlowTreeNode>
				aria-label={t("flow.tree.label")}
				blockNode
				virtual={false}
				expandAction="click"
				classNames={{
					root: styles.treeRoot,
					item: styles.treeItem,
					itemTitle: styles.treeItemTitle,
					itemSwitcher: styles.treeItemSwitcher,
				}}
				treeData={treeData}
				titleRender={(item): ReactNode => {
					const node = item as FlowTreeNode;
					if (node.kind === "flow" && node.flowId !== undefined) {
						const flow: ConversationFlowSummary | undefined = flowById.get(node.flowId);
						return flow === undefined ? null : (
							<FlowTreeItem
								flow={flow}
								isSelected={flow.flowId === selectedFlowId}
								isMutating={isMutating}
								onArchive={onArchive}
							/>
						);
					}
					if (node.kind === "workspace" && node.workspaceId !== undefined) {
						return (
							<span className={styles.groupTitle}>
								{workspaceById.get(node.workspaceId)?.name ?? node.workspaceId}
							</span>
						);
					}
					return node.title ?? null;
				}}
				expandedKeys={expandedKeys}
				selectedKeys={selectedFlowId === null ? [] : [flowKey(selectedFlowId)]}
				draggable={{
					icon: false,
					nodeDraggable: (node): boolean => (node as FlowTreeNode).kind === "flow",
				}}
				allowDrop={({ dragNode, dropNode, dropPosition }): boolean => {
					const drag = dragNode as FlowTreeNode;
					const drop = dropNode as FlowTreeNode;
					const dragFlow: ConversationFlowSummary | undefined =
						drag.flowId === undefined ? undefined : flowById.get(drag.flowId);
					if (drag.kind !== "flow" || dragFlow === undefined) return false;
					if (drop.kind === "section") {
						return (
							drop.section === "pinned" || (drop.section === "recent" && dragFlow.workspaceId === null)
						);
					}
					if (drop.kind === "workspace" || drop.kind === "empty") {
						const workspaceId: string | undefined =
							drop.workspaceId ??
							(drop.parentKey?.startsWith("flow-workspace:")
								? drop.parentKey.slice("flow-workspace:".length)
								: undefined);
						return (
							drop.section === "projects" &&
							dragFlow.workspaceId === workspaceId &&
							(drop.kind === "empty" || dropPosition === 0)
						);
					}
					const dropFlow: ConversationFlowSummary | undefined =
						drop.flowId === undefined ? undefined : flowById.get(drop.flowId);
					if (drop.kind !== "flow" || dropFlow === undefined || dropPosition === 0) return false;
					return (
						drag.section === drop.section &&
						(drag.section !== "projects" || dragFlow.workspaceId === dropFlow.workspaceId)
					);
				}}
				onExpand={(keys): void => {
					const nextExpandedKeys: string[] = keys.map(String);
					expandedKeysRef.current = nextExpandedKeys;
					setExpandedKeys(nextExpandedKeys);
					scheduleExpandedOrderSave();
				}}
				onSelect={(_selectedKeys: Key[], info): void => {
					const node: FlowTreeNode = info.node as FlowTreeNode;
					if (node.kind === "flow" && node.flowId !== undefined) onSelect(node.flowId);
				}}
				onDrop={handleDrop}
				switcherIcon={(nodeProps): React.JSX.Element | null => {
					const node: FlowTreeNode = nodeProps as FlowTreeNode;
					if (node.kind === "section") {
						return (
							<span
								className={styles.sectionSwitcher}
							>
								<Icon name="arrow-forward" />
							</span>
						);
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
		<span className={styles.item} data-running={isRunning ? "true" : undefined}>
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
