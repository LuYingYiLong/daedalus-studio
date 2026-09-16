import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InputRef } from "antd";
import type { MutableRefObject } from "react";
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
	type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import { FLOW_NODE_HEIGHT, FLOW_NODE_WIDTH, layoutFlowNodes } from "@/domain/flow/flow-layout";
import { updateFlowLayout } from "@/platform/rpc/flow-api";
import type { ConversationFlowNode, ConversationFlowNodePosition } from "@/platform/rpc/types";
import type { HomeFlowController } from "@/features/home/flow/useHomeFlowController";
import HomeChatSurface, { type HomeChatSurfaceProps } from "@/widgets/home/surface/HomeChatSurface";
import MessageList from "@/widgets/conversation/MessageList";
import ConversationSearchPanel from "@/widgets/conversation/ConversationSearchPanel";
import { AssistantFlowNode, UserFlowNode, type FlowCanvasNode } from "./FlowNodes";
import FlowWelcome from "./FlowWelcome";
import styles from "./HomeFlowSurface.module.css";

export type HomeFlowSurfaceProps = {
	controller: HomeFlowController;
	chatSurfaceProps: HomeChatSurfaceProps;
	searchHandleRef?: MutableRefObject<FlowSearchHandle | null>;
};

export type FlowSearchHandle = {
	openSearch: (selectedQuery?: string) => void;
	closeSearch: () => boolean;
};

const nodeTypes = { userNode: UserFlowNode, assistantNode: AssistantFlowNode };

function HomeFlowSurface({ controller, chatSurfaceProps, searchHandleRef }: HomeFlowSurfaceProps): React.JSX.Element {
	const { t } = useTranslation();
	const [nodes, setNodes] = useState<FlowCanvasNode[]>([]);
	const [renameOpen, setRenameOpen] = useState<boolean>(false);
	const [renameTitle, setRenameTitle] = useState<string>("");
	const [searchOpen, setSearchOpen] = useState<boolean>(false);
	const [searchQuery, setSearchQuery] = useState<string>("");
	const [activeSearchIndex, setActiveSearchIndex] = useState<number>(0);
	const searchInputRef = useRef<InputRef | null>(null);
	const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<FlowCanvasNode, Edge> | null>(null);
	const renderedFlowIdRef = useRef<string | null>(null);
	const snapshot = controller.snapshot;
	const graphPositions = useMemo((): Map<string, { x: number; y: number }> => {
		return layoutFlowNodes(snapshot?.nodes ?? [], snapshot?.positions ?? []);
	}, [snapshot?.nodes, snapshot?.positions]);
	const activePathNodeIds = useMemo((): Set<string> => {
		const path: Set<string> = new Set<string>();
		const branch = snapshot?.branches.find((candidate): boolean => candidate.branchId === controller.selectedBranchId);
		const nodesById: Map<string, ConversationFlowNode> = new Map(
			(snapshot?.nodes ?? []).map((node): [string, ConversationFlowNode] => [node.nodeId, node]),
		);
		let nodeId: string | null = branch?.headNodeId ?? null;
		while (nodeId !== null && !path.has(nodeId)) {
			path.add(nodeId);
			nodeId = nodesById.get(nodeId)?.parentNodeId ?? null;
		}
		if (path.size === 0 && branch !== undefined) {
			for (const node of snapshot?.nodes ?? []) {
				if (node.branchId === branch.branchId) path.add(node.nodeId);
			}
		}
		return path;
	}, [controller.selectedBranchId, snapshot?.branches, snapshot?.nodes]);
	const normalizedSearchQuery: string = searchQuery.trim().toLocaleLowerCase();
	const matchingNodes = useMemo((): ConversationFlowNode[] => {
		if (normalizedSearchQuery.length === 0) return [];
		return (snapshot?.nodes ?? []).filter((node): boolean =>
			node.contentPreview.toLocaleLowerCase().includes(normalizedSearchQuery),
		);
	}, [normalizedSearchQuery, snapshot?.nodes]);
	const matchingNodeIds = useMemo((): Set<string> => {
		return new Set(matchingNodes.map((node): string => node.nodeId));
	}, [matchingNodes]);
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
								className: activePathNodeIds.has(node.parentNodeId) && activePathNodeIds.has(node.nodeId)
									? styles.activePathEdge
									: undefined,
							},
						];
			}),
		[activePathNodeIds, snapshot?.nodes],
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
						active: activePathNodeIds.has(flowNode.nodeId),
						matched: matchingNodeIds.has(flowNode.nodeId),
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
	}, [activeBranchId, activePathNodeIds, controller, graphPositions, matchingNodeIds, snapshot?.flow.activeRequestId, snapshot?.nodes]);

	const focusSearchResult = useCallback((index: number): void => {
		const target: ConversationFlowNode | undefined = matchingNodes[index];
		if (target === undefined || flowInstance === null) return;
		const position = graphPositions.get(target.nodeId);
		if (position === undefined) return;
		flowInstance.setCenter(
			position.x + FLOW_NODE_WIDTH / 2,
			position.y + FLOW_NODE_HEIGHT / 2,
			{ zoom: 1, duration: 300 },
		);
	}, [flowInstance, graphPositions, matchingNodes]);

	const openSearch = useCallback((selectedQuery?: string): void => {
		if (selectedQuery !== undefined) {
			setSearchQuery(selectedQuery);
			setActiveSearchIndex(0);
		}
		setSearchOpen(true);
		window.setTimeout((): void => {
			searchInputRef.current?.focus({ cursor: "end" });
		}, 0);
	}, []);
	const closeSearch = useCallback((): boolean => {
		if (!searchOpen) return false;
		setSearchOpen(false);
		setSearchQuery("");
		setActiveSearchIndex(0);
		return true;
	}, [searchOpen]);
	const goPreviousSearchResult = useCallback((): void => {
		if (matchingNodes.length === 0) return;
		setActiveSearchIndex((current): number =>
			(current - 1 + matchingNodes.length) % matchingNodes.length,
		);
	}, [matchingNodes.length]);
	const goNextSearchResult = useCallback((): void => {
		if (matchingNodes.length === 0) return;
		setActiveSearchIndex((current): number => (current + 1) % matchingNodes.length);
	}, [matchingNodes.length]);

	useEffect((): void => {
		if (matchingNodes.length === 0) {
			setActiveSearchIndex(0);
			return;
		}
		if (activeSearchIndex >= matchingNodes.length) {
			setActiveSearchIndex(0);
			return;
		}
		if (searchOpen) focusSearchResult(activeSearchIndex);
	}, [activeSearchIndex, focusSearchResult, matchingNodes.length, searchOpen]);

	useEffect((): (() => void) | void => {
		if (searchHandleRef === undefined) return;
		searchHandleRef.current = { openSearch, closeSearch };
		return (): void => {
			if (searchHandleRef.current?.openSearch === openSearch) {
				searchHandleRef.current = null;
			}
		};
	}, [closeSearch, openSearch, searchHandleRef]);

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
		if (controller.isNewFlowHome) {
			return (
				<section className={styles.flowSurface} data-studio-flow-surface="true">
					<header className={styles.flowHeader}>
						<Typography.Text className={styles.flowTitle}>{t("flow.new.title")}</Typography.Text>
					</header>
					<div className={`${styles.canvasRegion} ${styles.flowWelcomeCanvasRegion}`}>
						<FlowWelcome
							errorMessage={chatSurfaceProps.sessionError ?? controller.error}
							onStarterSelect={chatSurfaceProps.handleHomeStarterSelect}
						/>
					</div>
					<div className={`${styles.flowComposerHost} ${styles.flowWelcomeComposerHost}`}>
						{chatSurfaceProps.renderComposer(false, true, true)}
					</div>
				</section>
			);
		}
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
				<Space className={styles.flowHeaderActions}>
					<Button
						type="text"
						shape="circle"
						icon={<Icon name="search" />}
						aria-label={t("agentPage.conversationSearch.placeholder")}
						onClick={(): void => openSearch()}
					/>
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
				<ConversationSearchPanel
					open={searchOpen}
					query={searchQuery}
					current={matchingNodes.length === 0 ? 0 : activeSearchIndex + 1}
					total={matchingNodes.length}
					loading={false}
					inputRef={searchInputRef}
					onQueryChange={(query): void => {
						setSearchQuery(query);
						setActiveSearchIndex(0);
					}}
					onPrevious={goPreviousSearchResult}
					onNext={goNextSearchResult}
					onClose={closeSearch}
				/>
				{controller.isLoading ? <Spin fullscreen={false} className={styles.canvasSpinner} /> : null}
				{nodes.length === 0 ? <div className={styles.emptyCanvasHint}>{t("flow.empty.canvas")}</div> : null}
				<ReactFlow<FlowCanvasNode, Edge>
					nodes={nodes}
					edges={edges}
					onInit={setFlowInstance}
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
				<HomeChatSurface {...chatSurfaceProps} composerFloating composerFloatingWithFooter />
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
