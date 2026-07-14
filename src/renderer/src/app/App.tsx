import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Typography } from "antd";
import { Icon } from "@/assets/icons";
import { selectWorkspace } from "@/api/workspace-api";
import styles from "./App.module.css";
import WorkspaceTree from "@/features/workspace/WorkspaceTree";
import type { AdditionalContextItem, SessionOpenResult, SessionTimelineResult, TimelineBlock, WorkbenchPatch, WorkbenchSnapshot, WorkspaceConfig } from "@/api/types";
import { fetchSessionTimeline, fetchSessionTimelineAfter, fetchSessionTimelineBefore, openSession } from "@/api/session-api";
import MessageList from "@/features/chat/MessageList";
import Composer from "@/features/composer/Composer";
import { fetchProviderModelSelection, type ProviderModelSelection } from "@/api/provider-api";
import { createBackendClient } from "@/api/backend-client";
import type { BackendEvent } from "@/api/backend-rpc-client";
import { cancelChatMessage, sendChatMessage, type ChatMode } from "@/api/chat-api";
import {
	approveApproval,
	rejectApproval,
	setApprovalMode,
	type ApprovalMode,
} from "@/api/approval-api";
import WorkbenchPanel from "@/features/workbench/WorkbenchPanel";
import {
	applyBackendEventToTimeline,
	applyWorkbenchSnapshot,
	createTimelinePageFromOpenResult,
	createTimelinePageFromTimelineResult,
	emptyTimelinePage,
	mergeTimelineAfter,
	mergeTimelineBefore,
	type TimelinePageState
} from "@/features/workbench/workbench-state";
import { patchWorkbench } from "@/api/workbench-api";

function createChatRequestId(): string {
	return `studio-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getWorkbenchFromEvent(event: BackendEvent): WorkbenchSnapshot | null {
	if (event.event !== "session.workbench.updated" || !isRecord(event.data)) {
		return null;
	}

	const workbench: unknown = event.data.workbench;
	if (!isRecord(workbench) || typeof workbench.revision !== "number") {
		return null;
	}

	return workbench as WorkbenchSnapshot;
}

function mergePatch(left: WorkbenchPatch, right: WorkbenchPatch): WorkbenchPatch {
	return {
		...left,
		...right,
		composer: {
			...left.composer,
			...right.composer
		}
	};
}

function getChatMode(workbench: WorkbenchSnapshot | null): ChatMode {
	return workbench?.composer.chatMode ?? "ask";
}

function getActiveRunRequestId(workbench: WorkbenchSnapshot | null): string | null {
	const activeRun = workbench?.activeRun;
	if (activeRun === undefined || activeRun.status === "idle") {
		return null;
	}

	return activeRun.requestId ?? null;
}

function getIsSending(workbench: WorkbenchSnapshot | null): boolean {
	const status = workbench?.activeRun.status;

	return status === "streaming" || status === "approval" || status === "paused" || status === "cancelling";
}

function App(): React.JSX.Element {
	const [workspaceRefreshToken, setWorkspaceRefreshToken] = useState<number>(0);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceConfig | null>(null);
	const [timelinePage, setTimelinePage] = useState<TimelinePageState>(emptyTimelinePage);
	const [workbench, setWorkbench] = useState<WorkbenchSnapshot | null>(null);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [isSessionLoading, setIsSessionLoading] = useState(false);
	const [providerModelSelection, setProviderModelSelection] = useState<ProviderModelSelection | null>(null);
	const [approvalMode, setApprovalModeState] = useState<ApprovalMode>("manual");
	const [approvalAction, setApprovalAction] = useState<"approve" | "reject" | null>(null);
	const [workbenchPanelOpen, setWorkbenchPanelOpen] = useState<boolean>(true);
	const pendingPatchRef = useRef<WorkbenchPatch>({});
	const patchTimerRef = useRef<number | null>(null);
	const patchSequenceRef = useRef<number>(0);
	const isTimelinePageLoadingRef = useRef<boolean>(false);

	const applyWorkbench = useCallback((nextWorkbench: WorkbenchSnapshot): void => {
		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot => {
			return applyWorkbenchSnapshot(currentWorkbench, nextWorkbench);
		});
	}, []);

	const sendPendingWorkbenchPatch = useCallback(async (): Promise<void> => {
		if (patchTimerRef.current !== null) {
			window.clearTimeout(patchTimerRef.current);
			patchTimerRef.current = null;
		}

		const pendingPatch: WorkbenchPatch = pendingPatchRef.current;
		pendingPatchRef.current = {};

		if (Object.keys(pendingPatch).length === 0) {
			return;
		}

		const result = await patchWorkbench({
			...pendingPatch,
			clientSequence: patchSequenceRef.current += 1
		});

		applyWorkbench(result.workbench);
	}, [activeSessionId, applyWorkbench]);

	const queueWorkbenchPatch = useCallback((patch: WorkbenchPatch, immediate: boolean = false): void => {
		pendingPatchRef.current = mergePatch(pendingPatchRef.current, patch);

		if (immediate) {
			void sendPendingWorkbenchPatch().catch((error: unknown): void => {
				console.error("[App] workbench patch failed", error);
			});
			return;
		}

		if (patchTimerRef.current !== null) {
			window.clearTimeout(patchTimerRef.current);
		}

		patchTimerRef.current = window.setTimeout((): void => {
			void sendPendingWorkbenchPatch().catch((error: unknown): void => {
				console.error("[App] workbench patch failed", error);
			});
		}, 220);
	}, [sendPendingWorkbenchPatch]);

	useEffect((): (() => void) => {
		return (): void => {
			if (patchTimerRef.current !== null) {
				window.clearTimeout(patchTimerRef.current);
			}
		};
	}, []);

	useEffect((): void => {
		async function loadProviderModelSelection(): Promise<void> {
			try {
				const result: ProviderModelSelection = await fetchProviderModelSelection();

				setProviderModelSelection(result);
			} catch (error: unknown) {
				console.error("[App] load provider model selection failed", error);
			}
		}

		void loadProviderModelSelection();
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
					const eventWorkbench: WorkbenchSnapshot | null = getWorkbenchFromEvent(event);
					if (eventWorkbench !== null) {
						applyWorkbench(eventWorkbench);
						return;
					}

					setTimelinePage((currentPage: TimelinePageState): TimelinePageState => {
						return {
							...currentPage,
							blocks: applyBackendEventToTimeline(currentPage.blocks, event)
						};
					});

					if (event.event === "agent.run.done" || event.event === "workflow.done" || event.event === "ai.done") {
						void refreshLatestTimeline();
					}
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
	}, [applyWorkbench]);

	async function handleWorkspaceSelect(workspaceId: string): Promise<void> {
		try {
			const workspace = await selectWorkspace(workspaceId);

			setActiveWorkspace(workspace);
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
			setTimelinePage(emptyTimelinePage);
			setWorkbench(null);

			const result: SessionOpenResult = await openSession(sessionId);

			setTimelinePage(createTimelinePageFromOpenResult(result));
			setWorkbench(result.workbench);
			setApprovalModeState(result.metadata.approvalMode ?? "manual");
			if (typeof result.workbench.activeSelection.workspaceId === "string" && typeof result.workbench.activeSelection.workspaceRoot === "string") {
				setActiveWorkspace({
					id: result.workbench.activeSelection.workspaceId,
					name: result.workbench.activeSelection.workspaceName ?? result.metadata.title,
					kind: "godot",
					rootPath: result.workbench.activeSelection.workspaceRoot
				});
			}

			if (result.workspaceWarning) {
				console.warn("[App] session workspace warning", result.workspaceWarning);
			}
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to open session";

			setSessionError(message);
			console.error("[App] open session failed", error);
		} finally {
			setIsSessionLoading(false);
		}
	}

	async function handleModeChange(nextMode: ChatMode): Promise<void> {
		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
			return currentWorkbench === null
				? currentWorkbench
				: {
					...currentWorkbench,
					composer: {
						...currentWorkbench.composer,
						chatMode: nextMode
					}
				};
		});
		queueWorkbenchPatch({ composer: { chatMode: nextMode } }, true);
		setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
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
		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
			return currentWorkbench === null
				? currentWorkbench
				: {
					...currentWorkbench,
					composer: {
						...currentWorkbench.composer,
						provider: providerId,
						model: modelId
					}
				};
		});
		queueWorkbenchPatch({ composer: { provider: providerId, model: modelId } }, true);
	}

	function handleComposerTextChange(nextText: string): void {
		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
			return currentWorkbench === null
				? currentWorkbench
				: {
					...currentWorkbench,
					composer: {
						...currentWorkbench.composer,
						text: nextText
					}
				};
		});
		queueWorkbenchPatch({ composer: { text: nextText } });
	}

	async function handleComposerSubmit(): Promise<void> {
		if (activeSessionId === null || workbench === null) {
			setSessionError("请先打开一个会话再发送消息");
			return;
		}

		const message: string = workbench.composer.text.trim();
		if (message.length === 0) {
			return;
		}

		const requestId: string = createChatRequestId();

		try {
			setSessionError(null);
			await sendPendingWorkbenchPatch();
			await sendChatMessage({
				requestId,
				message,
				mode: getChatMode(workbench),
				additionalContext: workbench.composer.additionalContext
			});
			await refreshLatestTimeline();
			setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to send message";

			setSessionError(errorMessage);
			setTimelinePage((currentPage: TimelinePageState): TimelinePageState => {
				return {
					...currentPage,
					blocks: applyBackendEventToTimeline(currentPage.blocks, {
						type: "event",
						id: requestId,
						event: "agent.run.error",
						data: {
							code: "frontend_send_error",
							message: errorMessage
						}
					})
				};
			});
			console.error("[App] send message failed", error);
		}
	}

	async function handleComposerCancel(): Promise<void> {
		const requestId: string | null = getActiveRunRequestId(workbench);
		if (requestId === null) {
			return;
		}

		try {
			await cancelChatMessage(requestId);
		} catch (error: unknown) {
			console.error("[App] cancel chat failed", error);
		}
	}

	async function refreshLatestTimeline(): Promise<void> {
		if (activeSessionId === null) {
			return;
		}

		const timeline: SessionTimelineResult = await fetchSessionTimeline(activeSessionId);

		setTimelinePage(createTimelinePageFromTimelineResult(timeline));
	}

	const handleLoadMoreBefore = useCallback((): void => {
		if (activeSessionId === null || !timelinePage.hasMoreBefore || isTimelinePageLoadingRef.current) {
			return;
		}

		isTimelinePageLoadingRef.current = true;
		void fetchSessionTimelineBefore(activeSessionId, timelinePage.blockOffset)
			.then((result: SessionTimelineResult): void => {
				setTimelinePage((currentPage: TimelinePageState): TimelinePageState => {
					return mergeTimelineBefore(currentPage, createTimelinePageFromTimelineResult(result));
				});
			})
			.catch((error: unknown): void => {
				console.error("[App] load previous timeline page failed", error);
			})
			.finally((): void => {
				isTimelinePageLoadingRef.current = false;
			});
	}, [activeSessionId, timelinePage.blockOffset, timelinePage.hasMoreBefore]);

	const handleLoadMoreAfter = useCallback((): void => {
		if (activeSessionId === null || !timelinePage.hasMoreAfter || isTimelinePageLoadingRef.current) {
			return;
		}

		isTimelinePageLoadingRef.current = true;
		void fetchSessionTimelineAfter(activeSessionId, timelinePage.blockOffset + timelinePage.blocks.length)
			.then((result: SessionTimelineResult): void => {
				setTimelinePage((currentPage: TimelinePageState): TimelinePageState => {
					return mergeTimelineAfter(currentPage, createTimelinePageFromTimelineResult(result));
				});
			})
			.catch((error: unknown): void => {
				console.error("[App] load next timeline page failed", error);
			})
			.finally((): void => {
				isTimelinePageLoadingRef.current = false;
			});
	}, [activeSessionId, timelinePage.blockOffset, timelinePage.blocks.length, timelinePage.hasMoreAfter]);

	function patchContext(action: NonNullable<WorkbenchPatch["additionalContextAction"]>): void {
		queueWorkbenchPatch({ additionalContextAction: action }, true);
	}

	async function handleApproveApproval(approvalId: string): Promise<void> {
		try {
			setApprovalAction("approve");
			await sendPendingWorkbenchPatch();
			const result = await approveApproval(approvalId);
			if ("workbench" in result && isRecord(result.workbench)) {
				applyWorkbench(result.workbench as WorkbenchSnapshot);
			}
		} catch (error: unknown) {
			setSessionError(error instanceof Error ? error.message : "Failed to approve");
		} finally {
			setApprovalAction(null);
		}
	}

	async function handleRejectApproval(approvalId: string): Promise<void> {
		try {
			setApprovalAction("reject");
			const result = await rejectApproval(approvalId);
			if ("workbench" in result && isRecord(result.workbench)) {
				applyWorkbench(result.workbench as WorkbenchSnapshot);
			}
		} catch (error: unknown) {
			setSessionError(error instanceof Error ? error.message : "Failed to reject");
		} finally {
			setApprovalAction(null);
		}
	}

	const selectedProviderId: string | null = workbench?.composer.provider ?? providerModelSelection?.activeModel.providerId ?? null;
	const selectedModelId: string | null = workbench?.composer.model ?? providerModelSelection?.activeModel.modelId ?? null;
	const timelineBlocks: TimelineBlock[] = timelinePage.blocks;

	return (
		<main className={`${styles.shell} ${workbenchPanelOpen ? styles.shellWithPanel : ""}`}>
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
						{workbench?.sessionId ?? activeSessionId ?? "Session"}
					</Typography.Title>
					<Button
						type={workbenchPanelOpen ? "default" : "text"}
						icon={<Icon name="mcp" />}
						onClick={(): void => setWorkbenchPanelOpen((currentOpen: boolean): boolean => !currentOpen)}
					>
						Workbench
					</Button>
				</header>

				<MessageList
					blocks={timelineBlocks}
					isLoading={isSessionLoading}
					errorMessage={sessionError}
					hasMoreBefore={timelinePage.hasMoreBefore}
					hasMoreAfter={timelinePage.hasMoreAfter}
					onLoadMoreBefore={handleLoadMoreBefore}
					onLoadMoreAfter={handleLoadMoreAfter}
				/>

				<footer className={styles.composer}>
					<Composer
						providerModelSelection={providerModelSelection}
						selectedProviderId={selectedProviderId}
						selectedModelId={selectedModelId}
						message={workbench?.composer.text ?? ""}
						contextItems={workbench?.composer.additionalContext ?? []}
						mode={getChatMode(workbench)}
						approvalMode={approvalMode}
						isSending={getIsSending(workbench) || approvalAction !== null}
						onMessageChange={handleComposerTextChange}
						onModeChange={(mode: ChatMode): void => {
							void handleModeChange(mode);
						}}
						onApprovalModeChange={(mode: ApprovalMode): void => {
							void handleApprovalModeChange(mode);
						}}
						onProviderModelChange={(providerId: string, modelId: string): void => {
							void handleProviderModelChange(providerId, modelId);
						}}
						onRemoveContext={(contextId: string): void => patchContext({ action: "remove", contextId })}
						onPinContext={(contextId: string, pinned: boolean): void => patchContext({ action: "pin", contextId, pinned })}
						onClearUnpinnedContext={(): void => patchContext({ action: "clearUnpinned" })}
						onCancel={(): void => {
							void handleComposerCancel();
						}}
						onSubmit={(): void => {
							void handleComposerSubmit();
						}}
					/>
				</footer>
			</section>

			<WorkbenchPanel
				open={workbenchPanelOpen}
				workbench={workbench}
				activeWorkspace={activeWorkspace}
				onClose={(): void => setWorkbenchPanelOpen(false)}
				onAddContext={(item: AdditionalContextItem): void => patchContext({ action: "addOrReplace", item })}
				onRemoveContext={(contextId: string): void => patchContext({ action: "remove", contextId })}
				onPinContext={(contextId: string, pinned: boolean): void => patchContext({ action: "pin", contextId, pinned })}
				onClearUnpinnedContext={(): void => patchContext({ action: "clearUnpinned" })}
				onClearHints={(): void => queueWorkbenchPatch({ nextStepHintsAction: "clear" }, true)}
				onApprove={(approvalId: string): void => {
					void handleApproveApproval(approvalId);
				}}
				onReject={(approvalId: string): void => {
					void handleRejectApproval(approvalId);
				}}
			/>
		</main>
	);
}

export default App;
