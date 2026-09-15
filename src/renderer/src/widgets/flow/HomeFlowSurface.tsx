import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Drawer, Dropdown, Empty, Flex, Input, Modal, Select, Space, Spin, Tag, Typography } from "antd";
import {
	Background,
	Controls,
	MiniMap,
	ReactFlow,
	applyNodeChanges,
	type Edge,
	type NodeChange,
	type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import { layoutFlowNodes } from "@/domain/flow/flow-layout";
import { updateFlowLayout } from "@/platform/rpc/flow-api";
import type { ConversationFlowNodePosition } from "@/platform/rpc/types";
import type { HomeFlowController } from "@/features/home/flow/useHomeFlowController";
import HomeChatSurface, { type HomeChatSurfaceProps } from "@/widgets/home/surface/HomeChatSurface";
import MessageList from "@/widgets/conversation/MessageList";
import { AssistantFlowNode, UserFlowNode, type FlowCanvasNode } from "./FlowNodes";
import styles from "./HomeFlowSurface.module.css";

export type HomeFlowSurfaceProps = {
	controller: HomeFlowController;
	chatSurfaceProps: HomeChatSurfaceProps;
};

const nodeTypes = { userNode: UserFlowNode, assistantNode: AssistantFlowNode };

function HomeFlowSurface({ controller, chatSurfaceProps }: HomeFlowSurfaceProps): React.JSX.Element {
	const { t } = useTranslation();
	const [nodes, setNodes] = useState<FlowCanvasNode[]>([]);
	const [renameOpen, setRenameOpen] = useState<boolean>(false);
	const [renameTitle, setRenameTitle] = useState<string>("");
	const renderedFlowIdRef = useRef<string | null>(null);
	const snapshot = controller.snapshot;
	const graphPositions = useMemo((): Map<string, { x: number; y: number }> => {
		return layoutFlowNodes(snapshot?.nodes ?? [], snapshot?.positions ?? []);
	}, [snapshot?.nodes, snapshot?.positions]);
	const edges = useMemo(
		(): Edge[] =>
			(snapshot?.nodes ?? []).flatMap((node): Edge[] => {
				return node.parentNodeId === null
					? []
					: [
							{
								id: `${node.parentNodeId}->${node.nodeId}`,
								source: node.parentNodeId,
								target: node.nodeId,
								type: "smoothstep",
								animated: node.status === "streaming" || node.status === "waiting",
							},
						];
			}),
		[snapshot?.nodes],
	);
	const activeBranchId: string | null = controller.selectedBranchId;
	const busyOtherBranch: boolean =
		snapshot?.flow.activeBranchId !== null && snapshot?.flow.activeBranchId !== activeBranchId;

	useEffect((): void => {
		setNodes((current): FlowCanvasNode[] => {
			const sameFlow: boolean = renderedFlowIdRef.current === (snapshot?.flow.flowId ?? null);
			renderedFlowIdRef.current = snapshot?.flow.flowId ?? null;
			const currentPositions: Map<string, { x: number; y: number }> = new Map(
				(sameFlow ? current : []).map((node): [string, { x: number; y: number }] => [node.id, node.position]),
			);
			return (snapshot?.nodes ?? []).map(
				(flowNode): FlowCanvasNode => ({
					id: flowNode.nodeId,
					type: flowNode.role === "user" ? "userNode" : "assistantNode",
					position: currentPositions.get(flowNode.nodeId) ??
						graphPositions.get(flowNode.nodeId) ?? { x: 0, y: 0 },
					data: {
						flowNode,
						active: flowNode.branchId === activeBranchId,
						disabled: controller.isMutating || snapshot?.flow.activeRequestId !== null,
						onOpen: (node): void => {
							void controller.selectNode(node.nodeId);
						},
						onDerive: (node): void => {
							void controller.deriveFromNode(node);
						},
					},
				}),
			);
		});
	}, [activeBranchId, controller, graphPositions, snapshot?.flow.activeRequestId, snapshot?.nodes]);

	const handleNodeClick: NodeMouseHandler<FlowCanvasNode> = (_event, node): void => {
		controller.selectBranch(node.data.flowNode.branchId);
		void controller.selectNode(node.id);
	};

	async function saveNodePosition(node: FlowCanvasNode): Promise<void> {
		if (snapshot === null) return;
		const positions: ConversationFlowNodePosition[] = [{ nodeId: node.id, x: node.position.x, y: node.position.y }];
		try {
			await updateFlowLayout(snapshot.flow.flowId, snapshot.flow.revision, positions);
			await controller.refresh();
		} catch {
			await controller.refresh();
		}
	}

	if (snapshot === null) {
		return (
			<div className={styles.emptyState}>
				<Empty description={t("flow.empty.description")}>
					<Button
						type="primary"
						icon={<Icon name="add" />}
						loading={controller.isMutating}
						onClick={(): void => {
							void controller.createNewFlow();
						}}
					>
						{t("flow.actions.new")}
					</Button>
				</Empty>
			</div>
		);
	}

	return (
		<section className={styles.flowSurface} data-studio-flow-surface="true">
			<header
				className={styles.flowHeader}
				data-side-dock-open={chatSurfaceProps.sideDockOpen ? "true" : undefined}
			>
				<Flex gap="small" align="center" justify="center">
					<Typography.Text className={styles.flowTitle}>{snapshot.flow.title}</Typography.Text>
					<Tag>{t("flow.branchCount", { count: snapshot.branches.length })}</Tag>
				</Flex>
				<Space>
					<Select
						value={activeBranchId ?? undefined}
						className={styles.branchSelect}
						aria-label={t("flow.actions.selectBranch")}
						options={snapshot.branches.map((branch, index) => ({
							value: branch.branchId,
							label: t("flow.branchLabel", { count: index + 1 }),
						}))}
						onChange={controller.selectBranch}
					/>
					<Button
						icon={<Icon name="chat" />}
						loading={controller.isMutating}
						onClick={(): void => {
							void controller.copyCurrentBranchToChat();
						}}
					>
						{t("flow.actions.copyToChat")}
					</Button>
					<Dropdown
						trigger={["click"]}
						menu={{
							items: [
								{ key: "rename", label: t("flow.actions.rename"), icon: <Icon name="pencil" /> },
								{
									key: "archive",
									label: t("flow.actions.archive"),
									icon: <Icon name="archive" />,
									danger: true,
									disabled: snapshot.flow.activeRequestId !== null,
								},
							],
							onClick: ({ key }): void => {
								if (key === "rename") {
									setRenameTitle(snapshot.flow.title);
									setRenameOpen(true);
								} else if (key === "archive") {
									void controller.archiveCurrentFlow();
								}
							},
						}}
					>
						<Button
							type="text"
							shape="circle"
							icon={<Icon name="more-h" />}
							aria-label={t("flow.actions.more")}
						/>
					</Dropdown>
				</Space>
			</header>
			{controller.error !== null ? (
				<Alert className={styles.flowAlert} type="error" showIcon message={controller.error} />
			) : null}
			{busyOtherBranch ? (
				<Alert
					className={styles.flowAlert}
					type="info"
					showIcon
					title={t("flow.busy")}
					action={
						<Button
							size="small"
							onClick={(): void => controller.selectBranch(snapshot.flow.activeBranchId!)}
						>
							{t("flow.actions.openActiveBranch")}
						</Button>
					}
				/>
			) : null}
			<div className={styles.canvasRegion}>
				{controller.isLoading ? <Spin fullscreen={false} className={styles.canvasSpinner} /> : null}
				{nodes.length === 0 ? <div className={styles.emptyCanvasHint}>{t("flow.empty.canvas")}</div> : null}
				<ReactFlow<FlowCanvasNode, Edge>
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					fitView
					fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
					minZoom={0.2}
					maxZoom={1.8}
					nodesConnectable={false}
					elementsSelectable
					deleteKeyCode={null}
					onNodesChange={(changes: NodeChange<FlowCanvasNode>[]): void =>
						setNodes((current): FlowCanvasNode[] => applyNodeChanges(changes, current))
					}
					onNodeClick={handleNodeClick}
					onNodeDragStop={(_event, node): void => {
						void saveNodePosition(node);
					}}
				>
					<Background gap={24} size={1} />
					<MiniMap pannable zoomable nodeStrokeWidth={3} />
					<Controls showInteractive={false} />
				</ReactFlow>
			</div>
			<div className={styles.flowComposerHost} data-disabled={busyOtherBranch ? "true" : undefined}>
				{busyOtherBranch ? <div className={styles.composerBlocker} aria-hidden="true" /> : null}
				<HomeChatSurface {...chatSurfaceProps} composerFloating />
			</div>
			<Drawer
				open={controller.selectedNodeDetail !== null}
				title={t("flow.details.title")}
				size={560}
				destroyOnHidden
				onClose={(): void => {
					void controller.selectNode(null);
				}}
			>
				{controller.selectedNodeDetail === null ? null : (
					<div className={styles.nodeDetail}>
						<MessageList blocks={[controller.selectedNodeDetail.block]} hideInlineDiff />
					</div>
				)}
			</Drawer>
			<Modal
				open={renameOpen}
				title={t("flow.rename.title")}
				okText={t("flow.actions.rename")}
				confirmLoading={controller.isMutating}
				okButtonProps={{ disabled: renameTitle.trim().length === 0 }}
				onCancel={(): void => setRenameOpen(false)}
				onOk={(): void => {
					void controller.renameCurrentFlow(renameTitle).then((): void => setRenameOpen(false));
				}}
			>
				<Input
					value={renameTitle}
					maxLength={200}
					autoFocus
					onChange={(event): void => setRenameTitle(event.target.value)}
				/>
			</Modal>
		</section>
	);
}

export default HomeFlowSurface;
