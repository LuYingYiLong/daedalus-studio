import { useCallback, useEffect, useMemo, useState } from "react";
import {
	App,
	Button,
	Empty,
	Flex,
	Input,
	Select,
	Spin,
	Tag,
	Tree,
	Typography,
	type TreeDataNode,
} from "antd";
import { useTranslation } from "react-i18next";
import type { WorkspaceConfig, WorkspaceSourceFolder } from "@/platform/rpc/types";
import {
	callGodotRuntimeTool,
	createGodotRuntimeTestSession,
	listGodotRuntimeTestSessions,
	stopGodotRuntimeTestSession,
	type GodotRuntimeNode,
	type GodotRuntimeObservation,
	type GodotRuntimeTestSession,
	type GodotRuntimeToolResult,
} from "@/platform/rpc/godot-runtime-test-api";
import styles from "./GodotRuntimeTestPanel.module.css";

type GodotRuntimeTestPanelProps = {
	workspace: WorkspaceConfig | null;
	sourceFolders: WorkspaceSourceFolder[];
	primarySourceFolderId: string | null;
};

type RuntimeStep = {
	id: string;
	label: string;
	status: string;
};

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function buildTreeData(nodes: GodotRuntimeNode[]): TreeDataNode[] {
	const byPath = new Map<string, TreeDataNode>();
	const roots: TreeDataNode[] = [];
	for (const node of [...nodes].sort((left, right): number => left.nodePath.localeCompare(right.nodePath))) {
		const item: TreeDataNode = {
			key: node.nodeId,
			title: `${node.name || node.type} · ${node.type}`,
			children: [],
		};
		byPath.set(node.nodePath, item);
		const segments = node.nodePath.split("/");
		let parent: TreeDataNode | undefined;
		while (segments.length > 1 && parent === undefined) {
			segments.pop();
			parent = byPath.get(segments.join("/"));
		}
		if (parent === undefined) roots.push(item);
		else parent.children?.push(item);
	}
	return roots;
}

function GodotRuntimeTestPanel({
	workspace,
	sourceFolders,
	primarySourceFolderId,
}: GodotRuntimeTestPanelProps): React.JSX.Element {
	const { t } = useTranslation();
	const { message } = App.useApp();
	const godotSources = useMemo(
		(): WorkspaceSourceFolder[] => sourceFolders.filter((source): boolean => source.capabilities.godot),
		[sourceFolders],
	);
	const [sourceFolderId, setSourceFolderId] = useState<string | null>(
		godotSources.find((source): boolean => source.id === primarySourceFolderId)?.id ?? godotSources[0]?.id ?? null,
	);
	const [session, setSession] = useState<GodotRuntimeTestSession | null>(null);
	const [observation, setObservation] = useState<GodotRuntimeObservation | null>(null);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [textValue, setTextValue] = useState<string>("");
	const [selectIndex, setSelectIndex] = useState<number>(0);
	const [keyValue, setKeyValue] = useState<string>("enter");
	const [steps, setSteps] = useState<RuntimeStep[]>([]);
	const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
	const [busy, setBusy] = useState<boolean>(false);

	const selectedNode = observation?.nodes.find((node): boolean => node.nodeId === selectedNodeId) ?? null;
	const treeData = useMemo((): TreeDataNode[] => buildTreeData(observation?.nodes ?? []), [observation]);

	const refreshStatus = useCallback(async (): Promise<void> => {
		if (workspace === null) {
			setSession(null);
			return;
		}
		const sessions = await listGodotRuntimeTestSessions(workspace.id);
		setSession((current): GodotRuntimeTestSession | null => {
			if (current !== null) return sessions.find((candidate): boolean => candidate.testSessionId === current.testSessionId) ?? null;
			return sessions[0] ?? null;
		});
	}, [workspace]);

	useEffect((): (() => void) => {
		void refreshStatus().catch((): void => undefined);
		const timer = window.setInterval((): void => {
			void refreshStatus().catch((): void => undefined);
		}, 1500);
		return (): void => window.clearInterval(timer);
	}, [refreshStatus]);

	useEffect((): void => {
		if (sourceFolderId !== null && godotSources.some((source): boolean => source.id === sourceFolderId)) return;
		setSourceFolderId(godotSources.find((source): boolean => source.id === primarySourceFolderId)?.id ?? godotSources[0]?.id ?? null);
	}, [godotSources, primarySourceFolderId, sourceFolderId]);

	async function startTest(): Promise<void> {
		const source = godotSources.find((candidate): boolean => candidate.id === sourceFolderId);
		if (workspace === null || source === undefined) return;
		setBusy(true);
		try {
			const created = await createGodotRuntimeTestSession({ workspaceId: workspace.id, sourceFolderId: source.id });
			await window.electronAPI.workspaceFs.openLaunchTarget({
				workspaceRoot: source.path,
				targetId: "godot",
				godotExecutablePath: workspace.godotExecutablePath ?? null,
				godotRunMode: "project",
				godotRuntimeTest: {
					testSessionId: created.testSessionId,
					testSessionToken: created.token,
				},
			});
			setSession(created);
			setObservation(null);
			setSelectedNodeId(null);
			setSteps([]);
			setScreenshotDataUrl(null);
			void message.success(t("godotRuntimeTest.messages.started"));
		} catch (error: unknown) {
			void message.error(getErrorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	async function stopTest(): Promise<void> {
		if (session === null) return;
		setBusy(true);
		try {
			await stopGodotRuntimeTestSession(session.testSessionId);
			setSession(null);
			setObservation(null);
			setSelectedNodeId(null);
			setScreenshotDataUrl(null);
			void message.success(t("godotRuntimeTest.messages.stopped"));
		} catch (error: unknown) {
			void message.error(getErrorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	async function captureScreenshot(): Promise<void> {
		if (session === null || session.runtimeInstanceId === null || observation === null || sourceFolderId === null) return;
		setBusy(true);
		try {
			const result = await callGodotRuntimeTool<GodotRuntimeToolResult>("screenshot", {
				testSessionId: session.testSessionId,
				runtimeInstanceId: session.runtimeInstanceId,
				observationId: observation.observationId,
				sourceFolderId,
			});
			setScreenshotDataUrl(result.imageDataUrl);
		} catch (error: unknown) {
			void message.error(getErrorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	async function verifyNode(wait: boolean): Promise<void> {
		if (session === null || session.runtimeInstanceId === null || observation === null || selectedNode === null || sourceFolderId === null) return;
		setBusy(true);
		const stepId = `studio-runtime-${crypto.randomUUID()}`;
		try {
			const result = await callGodotRuntimeTool<GodotRuntimeToolResult>(wait ? "wait" : "assert", {
				testSessionId: session.testSessionId,
				runtimeInstanceId: session.runtimeInstanceId,
				observationId: observation.observationId,
				nodeId: selectedNode.nodeId,
				assertion: { property: wait ? "enabled" : "visibleInTree", equals: true },
				timeoutMsec: wait ? 5000 : undefined,
				sourceFolderId,
			});
			setSteps((current): RuntimeStep[] => [{ id: stepId, label: wait ? "wait enabled" : "assert visible", status: String(result.value.status ?? result.value.ok ?? "unknown") }, ...current].slice(0, 20));
		} catch (error: unknown) {
			setSteps((current): RuntimeStep[] => [{ id: stepId, label: wait ? "wait enabled" : "assert visible", status: getErrorMessage(error) }, ...current].slice(0, 20));
			void message.error(getErrorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	async function observe(): Promise<void> {
		if (session === null || session.runtimeInstanceId === null || sourceFolderId === null) return;
		setBusy(true);
		try {
			const result = await callGodotRuntimeTool<GodotRuntimeObservation>("observe", {
				testSessionId: session.testSessionId,
				runtimeInstanceId: session.runtimeInstanceId,
				sourceFolderId,
			});
			setObservation(result.value);
			setSelectedNodeId((current): string | null => result.value.nodes.some((node): boolean => node.nodeId === current) ? current : result.value.nodes[0]?.nodeId ?? null);
		} catch (error: unknown) {
			void message.error(getErrorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	async function dispatchAction(action: Record<string, unknown>): Promise<void> {
		if (session === null || session.runtimeInstanceId === null || observation === null || selectedNode === null || sourceFolderId === null) return;
		setBusy(true);
		const actionId = `studio-runtime-${crypto.randomUUID()}`;
		try {
			const result = await callGodotRuntimeTool<GodotRuntimeToolResult>("action", {
				testSessionId: session.testSessionId,
				runtimeInstanceId: session.runtimeInstanceId,
				observationId: observation.observationId,
				nodeId: selectedNode.nodeId,
				actionId,
				action,
				sourceFolderId,
			});
			setSteps((current): RuntimeStep[] => [{ id: actionId, label: String(action.type), status: String(result.value.status ?? "unknown") }, ...current].slice(0, 20));
			await observe();
		} catch (error: unknown) {
			setSteps((current): RuntimeStep[] => [{ id: actionId, label: String(action.type), status: getErrorMessage(error) }, ...current].slice(0, 20));
			void message.error(getErrorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	if (workspace === null || godotSources.length === 0) {
		return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("godotRuntimeTest.empty.noGodotWorkspace")} />;
	}

	return (
		<div className={styles.panel}>
			<Flex className={styles.toolbar} gap="small" align="center" wrap>
				<Select
					className={styles.sourceSelect}
					value={sourceFolderId}
					options={godotSources.map((source): { value: string; label: string } => ({ value: source.id, label: source.path }))}
					onChange={setSourceFolderId}
					disabled={session !== null}
				/>
				<Tag color={session?.online ? "success" : session === null ? "default" : "processing"}>
					{session?.online ? t("godotRuntimeTest.status.connected") : session === null ? t("godotRuntimeTest.status.stopped") : t("godotRuntimeTest.status.waiting")}
				</Tag>
				<div className={styles.toolbarSpacer} />
				{session === null ? (
					<Button type="primary" loading={busy} onClick={() => void startTest()}>{t("godotRuntimeTest.actions.start")}</Button>
				) : (
					<>
						<Button disabled={!session.online} loading={busy} onClick={() => void observe()}>{t("godotRuntimeTest.actions.observe")}</Button>
						<Button disabled={observation === null} loading={busy} onClick={() => void captureScreenshot()}>{t("godotRuntimeTest.actions.screenshot")}</Button>
						<Button danger loading={busy} onClick={() => void stopTest()}>{t("godotRuntimeTest.actions.stop")}</Button>
					</>
				)}
			</Flex>

			{busy && observation === null ? <Spin className={styles.loading} /> : null}
			{session !== null && !session.online ? <Typography.Text type="secondary">{t("godotRuntimeTest.waitingDescription")}</Typography.Text> : null}
			{observation === null ? (
				<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("godotRuntimeTest.empty.noObservation")} />
			) : (
				<div className={styles.content}>
					<div className={styles.treePane}>
						<Flex justify="space-between" align="center">
							<Typography.Text strong>{t("godotRuntimeTest.tree.title")}</Typography.Text>
							<Typography.Text type="secondary">{observation.nodeCount}{observation.truncated ? "+" : ""}</Typography.Text>
						</Flex>
						<Tree
							className={styles.tree}
							treeData={treeData}
							selectedKeys={selectedNodeId === null ? [] : [selectedNodeId]}
							onSelect={(keys): void => setSelectedNodeId(keys[0] === undefined ? null : String(keys[0]))}
							defaultExpandAll
						/>
					</div>
					<div className={styles.detailsPane}>
						{selectedNode === null ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
							<>
								<Typography.Title level={5}>{selectedNode.name || selectedNode.type}</Typography.Title>
								<Typography.Paragraph className={styles.path} copyable>{selectedNode.nodePath}</Typography.Paragraph>
								<Flex gap="small" wrap>
									<Tag>{selectedNode.type}</Tag>
									<Tag color={selectedNode.visibleInTree ? "success" : "default"}>{selectedNode.visibleInTree ? t("godotRuntimeTest.node.visible") : t("godotRuntimeTest.node.hidden")}</Tag>
									<Tag color={selectedNode.enabled ? "success" : "warning"}>{selectedNode.enabled ? t("godotRuntimeTest.node.enabled") : t("godotRuntimeTest.node.disabled")}</Tag>
								</Flex>
								<Typography.Paragraph className={styles.metrics} type="secondary">
									{`x ${selectedNode.globalRect.x.toFixed(1)} · y ${selectedNode.globalRect.y.toFixed(1)} · ${selectedNode.globalRect.width.toFixed(1)} × ${selectedNode.globalRect.height.toFixed(1)}`}
								</Typography.Paragraph>
								{selectedNode.text ? <Typography.Paragraph className={styles.nodeText}>{selectedNode.text}</Typography.Paragraph> : null}
								<Flex className={styles.actions} vertical gap="small">
									{selectedNode.supportedActions.includes("button_press") ? <Button onClick={() => void dispatchAction({ type: "button_press" })}>{t("godotRuntimeTest.actions.press")}</Button> : null}
									{selectedNode.supportedActions.includes("toggle") ? <Button onClick={() => void dispatchAction({ type: "toggle" })}>{t("godotRuntimeTest.actions.toggle")}</Button> : null}
									{selectedNode.supportedActions.includes("set_text") ? <Flex gap="small"><Input value={textValue} maxLength={4096} onChange={(event): void => setTextValue(event.target.value)} /><Button onClick={() => void dispatchAction({ type: "set_text", text: textValue })}>{t("godotRuntimeTest.actions.setText")}</Button></Flex> : null}
									{selectedNode.supportedActions.includes("select") ? <Flex gap="small"><Input type="number" min={0} value={selectIndex} onChange={(event): void => setSelectIndex(Math.max(0, Number(event.target.value) || 0))} /><Button onClick={() => void dispatchAction({ type: "select", index: selectIndex })}>{t("godotRuntimeTest.actions.select")}</Button></Flex> : null}
									{selectedNode.supportedActions.includes("key_press") ? <Flex gap="small"><Select className={styles.keySelect} value={keyValue} onChange={setKeyValue} options={["enter", "tab", "shift+tab", "escape", "backspace", "delete", "arrow_up", "arrow_down", "arrow_left", "arrow_right", "home", "end", "page_up", "page_down", "ctrl+a", "ctrl+f", "ctrl+s", "ctrl+z", "ctrl+y"].map((key): { value: string; label: string } => ({ value: key, label: key }))} /><Button onClick={() => void dispatchAction({ type: "key_press", key: keyValue })}>{t("godotRuntimeTest.actions.key")}</Button></Flex> : null}
									<Flex gap="small"><Button onClick={() => void verifyNode(false)}>{t("godotRuntimeTest.actions.assertVisible")}</Button><Button onClick={() => void verifyNode(true)}>{t("godotRuntimeTest.actions.waitEnabled")}</Button></Flex>
								</Flex>
							</>
						)}
						{screenshotDataUrl === null ? null : <img className={styles.screenshot} src={screenshotDataUrl} alt={t("godotRuntimeTest.screenshotAlt")} />}
						{steps.length > 0 ? <div className={styles.steps}><Typography.Text strong>{t("godotRuntimeTest.steps.title")}</Typography.Text>{steps.map((step): React.JSX.Element => <Flex key={step.id} justify="space-between"><Typography.Text>{step.label}</Typography.Text><Typography.Text type="secondary">{step.status}</Typography.Text></Flex>)}</div> : null}
					</div>
				</div>
			)}
		</div>
	);
}

export default GodotRuntimeTestPanel;
