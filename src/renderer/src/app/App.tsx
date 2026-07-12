import { useEffect, useState } from "react";
import { Button, Typography } from "antd";
import { Icon } from "@/assets/icons";
import { selectWorkspace } from "@/api/workspace-api";
import styles from "./App.module.css";
import WorkspaceTree from "@/features/workspace/WorkspaceTree";
import { SessionOpenResult, TimelineAssistantBlock, TimelineBlock, TimelineBodyPart } from "@/api/types";
import { fetchSessionTimeline, openSession, saveSessionUiMetadata } from "@/api/session-api";
import MessageList from "@/features/chat/MessageList";
import Composer from "@/features/composer/Composer";
import { fetchProviderModelSelection, saveProviderModelSelection, type ProviderModelSelection } from "@/api/provider-api";
import { createBackendClient } from "@/api/backend-client";
import type { BackendEvent } from "@/api/backend-rpc-client";
import { cancelChatMessage, sendChatMessage, type ChatMode } from "@/api/chat-api";
import { fetchApprovalList, setApprovalMode, type ApprovalMode } from "@/api/approval-api";
import ApprovalDialog from "@/features/approval/ApprovalDialog";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getEventData(event: BackendEvent): Record<string, unknown> {
	return isRecord(event.data) ? event.data : {};
}

function getStringValue(record: Record<string, unknown>, key: string): string {
	const value: unknown = record[key];

	return typeof value === "string" ? value : "";
}

function createChatRequestId(): string {
	return `studio-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function appendMarkdownPart(parts: TimelineBodyPart[], text: string): TimelineBodyPart[] {
	if (text.length === 0) {
		return parts;
	}

	const nextParts: TimelineBodyPart[] = [...parts];
	const lastPart: TimelineBodyPart | undefined = nextParts[nextParts.length - 1];

	if (lastPart?.type === "markdown") {
		nextParts[nextParts.length - 1] = {
			...lastPart,
			text: lastPart.text + text
		};
		return nextParts;
	}

	return [...nextParts, { type: "markdown", text }];
}

function appendThinkingPart(parts: TimelineBodyPart[], text: string, done: boolean): TimelineBodyPart[] {
	const nextParts: TimelineBodyPart[] = [...parts];

	for (let index: number = nextParts.length - 1; index >= 0; index -= 1) {
		const part: TimelineBodyPart = nextParts[index]!;

		if (part.type !== "thinking" || part.done) {
			continue;
		}

		nextParts[index] = {
			...part,
			text: text.length > 0 ? part.text + text : part.text,
			done: done ? true : part.done
		};
		return nextParts;
	}

	return [...nextParts, { type: "thinking", text, done }];
}

function appendToolPart(parts: TimelineBodyPart[], event: BackendEvent): TimelineBodyPart[] {
	const data: Record<string, unknown> = getEventData(event);
	const toolCallId: string = getStringValue(data, "toolCallId")
		|| getStringValue(data, "approvalId")
		|| `${getStringValue(data, "toolName") || "tool"}:${event.id}`;
	const normalizedEvent: Record<string, unknown> = {
		...data,
		type: event.event.startsWith("agent.tool.") ? event.event.replace("agent.tool.", "tool.") : event.event
	};

	for (const part of parts) {
		if (part.type === "tool" && part.tool_call_id === toolCallId) {
			return parts.map((item: TimelineBodyPart): TimelineBodyPart => {
				if (item.type !== "tool" || item.tool_call_id !== toolCallId) {
					return item;
				}

				return {
					...item,
					events: [...item.events, normalizedEvent]
				};
			});
		}
	}

	return [...parts, {
		type: "tool",
		tool_call_id: toolCallId,
		events: [normalizedEvent]
	}];
}

function appendStatusPart(parts: TimelineBodyPart[], status: TimelineBodyPart): TimelineBodyPart[] {
	return [...parts, status];
}

function getAssistantContent(parts: TimelineBodyPart[], fallback: string): string {
	const content: string = parts
		.filter((part: TimelineBodyPart): part is Extract<TimelineBodyPart, { type: "markdown" }> => part.type === "markdown")
		.map((part: Extract<TimelineBodyPart, { type: "markdown" }>): string => part.text)
		.join("");

	return content.length > 0 ? content : fallback;
}

function updateAssistantBlockFromEvent(block: TimelineAssistantBlock, event: BackendEvent): TimelineAssistantBlock {
	const data: Record<string, unknown> = getEventData(event);
	const nowIso: string = new Date().toISOString();
	let nextParts: TimelineBodyPart[] = block.bodyParts;
	let nextStatus: TimelineAssistantBlock["status"] = block.status;
	let completedAtUtc: string = block.completedAtUtc;

	if (event.event === "ai.delta" || event.event === "agent.message.delta") {
		nextParts = appendMarkdownPart(nextParts, getStringValue(data, "text"));
	} else if (event.event === "ai.thinking.delta" || event.event === "agent.thinking.delta") {
		nextParts = appendThinkingPart(nextParts, getStringValue(data, "text"), false);
	} else if (event.event === "ai.thinking.done" || event.event === "agent.thinking.done") {
		nextParts = appendThinkingPart(nextParts, "", true);
	} else if (event.event === "ai.status") {
		nextParts = appendStatusPart(nextParts, {
			type: "status",
			status: getStringValue(data, "status") || "message",
			title: getStringValue(data, "title"),
			details: getStringValue(data, "details") || getStringValue(data, "detail"),
			code: getStringValue(data, "code")
		});
	} else if (event.event.startsWith("agent.tool.") || event.event.startsWith("tool.")) {
		nextParts = appendToolPart(nextParts, event);
	} else if (event.event === "plan.generated" || event.event === "plan.revised") {
		const planId: string = getStringValue(data, "planId");

		if (planId.length > 0) {
			nextParts = [...nextParts, {
				type: "plan",
				planId,
				title: getStringValue(data, "title") || "Plan",
				status: getStringValue(data, "status"),
				previewMarkdown: getStringValue(data, "previewMarkdown") || getStringValue(data, "markdown")
			}];
		}
	} else if (event.event === "agent.run.error" || event.event === "workflow.error") {
		nextStatus = "failed";
		completedAtUtc = nowIso;
		nextParts = appendStatusPart(nextParts, {
			type: "status",
			status: "error",
			title: "后端返回错误",
			details: getStringValue(data, "message") || "Unknown backend error",
			code: getStringValue(data, "code") || "agent_run_error"
		});
	} else if (event.event === "agent.run.cancelled" || event.event === "ai.cancelled") {
		nextStatus = undefined;
		completedAtUtc = nowIso;
		nextParts = appendStatusPart(nextParts, {
			type: "status",
			status: "info",
			title: "已停止",
			details: getStringValue(data, "reason") || "用户停止了本次响应",
			code: "cancelled"
		});
	} else if (event.event === "agent.message.done" || event.event === "agent.run.done" || event.event === "workflow.done" || event.event === "ai.done") {
		nextStatus = undefined;
		completedAtUtc = nowIso;
	} else {
		return block;
	}

	const content: string = getAssistantContent(nextParts, block.content);

	return {
		...block,
		content,
		completedAtUtc,
		status: nextStatus,
		bodyParts: nextParts
	};
}

function applyBackendEventToTimeline(blocks: TimelineBlock[], event: BackendEvent): TimelineBlock[] {
	let changed: boolean = false;
	const nextBlocks: TimelineBlock[] = blocks.map((block: TimelineBlock): TimelineBlock => {
		if (block.type !== "assistant" || block.requestId !== event.id) {
			return block;
		}

		changed = true;
		return updateAssistantBlockFromEvent(block, event);
	});

	return changed ? nextBlocks : blocks;
}

function createOptimisticBlocks(requestId: string, message: string, sentAtUtc: string): TimelineBlock[] {
	return [
		{
			id: `optimistic:${requestId}:user`,
			type: "user",
			requestId,
			content: message,
			sentAtUtc
		},
		{
			id: `optimistic:${requestId}:assistant`,
			type: "assistant",
			requestId,
			content: "",
			startedAtUtc: sentAtUtc,
			completedAtUtc: sentAtUtc,
			status: "running",
			bodyParts: []
		}
	];
}

function App(): React.JSX.Element {
	const [workspaceRefreshToken, setWorkspaceRefreshToken] = useState<number>(0);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [timelineBlocks, setTimelineBlocks] = useState<TimelineBlock[]>([]);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [isSessionLoading, setIsSessionLoading] = useState(false);
	const [isChatSending, setIsChatSending] = useState<boolean>(false);
	const [activeChatRequestId, setActiveChatRequestId] = useState<string | null>(null);
	const [providerModelSelection, setProviderModelSelection] = useState<ProviderModelSelection | null>(null);
	const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
	const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
	const [chatMode, setChatMode] = useState<ChatMode>("ask");
	const [approvalMode, setApprovalModeState] = useState<ApprovalMode>("manual");

	useEffect((): void => {
		async function loadProviderModelSelection(): Promise<void> {
			try {
				const result: ProviderModelSelection = await fetchProviderModelSelection();

				setProviderModelSelection(result);
				setSelectedProviderId(result.activeModel.providerId);
				setSelectedModelId(result.activeModel.modelId);
			} catch (error: unknown) {
				console.error("[App] load provider model selection failed", error);
			}
		}

		void loadProviderModelSelection();
	}, []);

	useEffect((): void => {
		async function loadApprovalMode(): Promise<void> {
			try {
				const result = await fetchApprovalList();

				setApprovalModeState(result.mode);
			} catch (error: unknown) {
				console.error("[App] load approval mode failed", error);
			}
		}

		void loadApprovalMode();
	}, []);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		let unsubscribe: (() => void) | null = null;

		async function subscribeBackendEvents(): Promise<void> {
			try {
				const client = await createBackendClient();

				if (cancelled) {
					return;
				}

				unsubscribe = client.addEventListener((event: BackendEvent): void => {
					setTimelineBlocks((currentBlocks: TimelineBlock[]): TimelineBlock[] => {
						return applyBackendEventToTimeline(currentBlocks, event);
					});
				});
			} catch (error: unknown) {
				console.error("[App] subscribe backend events failed", error);
			}
		}

		void subscribeBackendEvents();

		return (): void => {
			cancelled = true;
			unsubscribe?.();
		};
	}, []);

	async function handleWorkspaceSelect(workspaceId: string): Promise<void> {
		try {
			const workspace = await selectWorkspace(workspaceId);

			console.info("[App] workspace selected", workspace);
		} catch (error: unknown) {
			console.error("[App] select workspace failed", error);
		}
	}

	async function handleSessionSelect(sessionId: string): Promise<void> {
		console.info("[App] session selected", { sessionId });

		try {
			setIsSessionLoading(true);
			setSessionError(null);
			setActiveSessionId(sessionId);
			setTimelineBlocks([]);

			const result: SessionOpenResult = await openSession(sessionId);

			setTimelineBlocks(result.timelineBlocks);
			setChatMode(result.metadata.chatMode ?? "ask");

			if (result.workspaceWarning) {
				console.warn("[App] session workspace warning", result.workspaceWarning);
			}
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to open session";

			setSessionError(message);
			console.error("[App] open session failed", error)
		} finally {
			setIsSessionLoading(false);
		}
	}

	async function handleModeChange(nextMode: ChatMode): Promise<void> {
		setChatMode(nextMode);

		if (activeSessionId === null) {
			return;
		}

		try {
			await saveSessionUiMetadata({
				chatMode: nextMode
			});
			setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
		} catch (error: unknown) {
			console.error("[App] save chat mode failed", error);
		}
	}

	async function handleApprovalModeChange(nextMode: ApprovalMode): Promise<void> {
		const previousMode: ApprovalMode = approvalMode;

		setApprovalModeState(nextMode);

		try {
			const result = await setApprovalMode(nextMode);

			setApprovalModeState(result.mode);
		} catch (error: unknown) {
			setApprovalModeState(previousMode);
			console.error("[App] save approval mode failed", error);
		}
	}

	async function handleProviderModelChange(providerId: string, modelId: string): Promise<void> {
		const previousProviderId: string | null = selectedProviderId;
		const previousModelId: string | null = selectedModelId;

		setSelectedProviderId(providerId);
		setSelectedModelId(modelId);

		try {
			await saveProviderModelSelection({
				provider: providerId,
				model: modelId,
				activate: true
			});

			if (activeSessionId !== null) {
				await saveSessionUiMetadata({
					provider: providerId,
					model: modelId
				});
			}

			const result: ProviderModelSelection = await fetchProviderModelSelection();

			setProviderModelSelection(result);
			setSelectedProviderId(result.activeModel.providerId);
			setSelectedModelId(result.activeModel.modelId);
			setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
		} catch (error: unknown) {
			setSelectedProviderId(previousProviderId);
			setSelectedModelId(previousModelId);
			console.error("[App] save provider model selection failed", error);
		}
	}

	async function handleComposerSubmit(message: string): Promise<void> {
		if (activeSessionId === null) {
			setSessionError("请先打开一个会话再发送消息");
			return;
		}

		const requestId: string = createChatRequestId();
		const sentAtUtc: string = new Date().toISOString();

		setSessionError(null);
		setIsChatSending(true);
		setActiveChatRequestId(requestId);
		setTimelineBlocks((currentBlocks: TimelineBlock[]): TimelineBlock[] => {
			return [
				...currentBlocks,
				...createOptimisticBlocks(requestId, message, sentAtUtc)
			];
		});

		try {
			await sendChatMessage({
				requestId,
				message,
				mode: chatMode
			});

			const timeline = await fetchSessionTimeline(activeSessionId);

			setTimelineBlocks(timeline.timelineBlocks);
			setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to send message";

			setSessionError(errorMessage);
			setTimelineBlocks((currentBlocks: TimelineBlock[]): TimelineBlock[] => {
				return applyBackendEventToTimeline(currentBlocks, {
					type: "event",
					id: requestId,
					event: "agent.run.error",
					data: {
						code: "frontend_send_error",
						message: errorMessage
					}
				});
			});
			console.error("[App] send message failed", error);
		} finally {
			setIsChatSending(false);
			setActiveChatRequestId((currentRequestId: string | null): string | null => {
				return currentRequestId === requestId ? null : currentRequestId;
			});
		}
	}

	async function handleComposerCancel(): Promise<void> {
		if (activeChatRequestId === null) {
			return;
		}

		try {
			await cancelChatMessage(activeChatRequestId);
		} catch (error: unknown) {
			console.error("[App] cancel chat failed", error);
		}
	}

	return (
		<main className={styles.shell}>
			<aside className={styles.workspaceSidebar}>
				<header className={styles.workspaceHeader}>
					<Button type="text" block={true} className={styles.createSessionButton}>
						New session
					</Button>
				</header>

				<div className={styles.workspaceTitleRow}>
					<Typography.Title level={4} className={styles.workspaceTitle}>
						Workspace
					</Typography.Title>
					<Button
						className={styles.workspaceRefreshButton}
						size="small"
						type="text"
						icon={<Icon name="reload" />}
						onClick={(): void => {
							setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
						}}
					/>
				</div>

				<WorkspaceTree
					refreshToken={workspaceRefreshToken}
					onWorkspaceSelect={(workspaceId: string): void => {
						void handleWorkspaceSelect(workspaceId);
					}}
					onSessionSelect={handleSessionSelect}
				/>
			</aside>

			<section className={styles.chatPanel}>
				<header className={styles.chatHeader}>
					<Typography.Title level={4} className={styles.chatTitle}>
						Session Name
					</Typography.Title>
				</header>

				<MessageList
					blocks={timelineBlocks}
					isLoading={isSessionLoading}
					errorMessage={sessionError}
				/>

				<footer className={styles.composer}>
					<Composer
						providerModelSelection={providerModelSelection}
						selectedProviderId={selectedProviderId}
						selectedModelId={selectedModelId}
						mode={chatMode}
						approvalMode={approvalMode}
						isSending={isChatSending}
						onModeChange={(mode: ChatMode): void => {
							void handleModeChange(mode);
						}}
						onApprovalModeChange={(mode: ApprovalMode): void => {
							void handleApprovalModeChange(mode);
						}}
						onProviderModelChange={(providerId: string, modelId: string): void => {
							void handleProviderModelChange(providerId, modelId);
						}}
						onCancel={(): void => {
							void handleComposerCancel();
						}}
						onSubmit={(message: string): void => {
							void handleComposerSubmit(message);
						}}
					/>
				</footer>
			</section>
		</main>
	);
}

export default App;
