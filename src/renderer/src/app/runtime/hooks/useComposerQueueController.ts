import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
	AdditionalContextItem,
	MessageQueueItem,
	WorkbenchPatch,
	WorkbenchPatchResult,
	WorkbenchSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { ChatMode } from "@/platform/rpc/chat-api";
import {
	clearUnpinnedComposerContext,
	editQueuedMessageInWorkbench,
	removeGuideFromWorkbench,
	removeQueuedMessageFromWorkbench,
	reorderGuidesInWorkbench,
	reorderPendingQueueInWorkbench,
} from "@/domain/composer/composer-queue-state";
import type { SkillSummary } from "@/platform/rpc/skill-api";
import { addGuide, deleteGuide, reorderGuides } from "@/platform/rpc/guide-api";
import {
	addQueuedMessage,
	removeQueuedMessage,
	reorderQueuedMessages,
} from "@/platform/rpc/message-queue-api";
import { extractEnabledSkillRefs } from "@/domain/composer/composer-completion";
import {
	getChatMode,
	getCurrentWorkspaceId,
	getChatOutputTarget,
} from "../app-helpers";
import {
	getRunControllerRequestId,
	type RunControllerState,
} from "@/domain/workbench/run-state";
import { mergeWorkbenchPatch } from "./useWorkbenchPatchQueue";

export type ComposerQueueControllerParams = {
	activeSessionId: string | null;
	activeSessionIdRef: MutableRefObject<string | null>;
	isNewSessionHome: boolean;
	workbench: WorkbenchSnapshot | null;
	activeWorkspace: WorkspaceConfig | null;
	skills: readonly SkillSummary[];
	runState: RunControllerState;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	applyWorkbench: (nextWorkbench: WorkbenchSnapshot) => void;
	takePendingWorkbenchPatch: () => WorkbenchPatch;
	sendWorkbenchPatch: (
		patch: WorkbenchPatch,
		applyResult?: boolean,
	) => Promise<WorkbenchPatchResult | null>;
	replaceComposerInput: (text: string, scopeId?: string) => void;
	setSessionError: (message: string | null) => void;
	onInfo: (message: string) => void;
};

export type ComposerQueueController = {
	handleQueueMessageSubmit: (
		nextMessage: string,
		modeOverride?: ChatMode,
	) => Promise<void>;
	handleGuideSubmit: (nextMessage: string) => Promise<void>;
	handleQueueMessageRemove: (queueId: number) => Promise<void>;
	handleQueueMessageEdit: (item: MessageQueueItem) => Promise<void>;
	handleQueueMessageReorder: (queueIds: number[]) => Promise<void>;
	handleGuideDelete: (guideId: string) => Promise<void>;
	handleGuideReorder: (guideIds: string[]) => Promise<void>;
};

function useComposerQueueController({
	activeSessionId,
	activeSessionIdRef,
	isNewSessionHome,
	workbench,
	activeWorkspace,
	skills,
	runState,
	setWorkbench,
	applyWorkbench,
	takePendingWorkbenchPatch,
	sendWorkbenchPatch,
	replaceComposerInput,
	setSessionError,
	onInfo,
}: ComposerQueueControllerParams): ComposerQueueController {
	async function handleQueueMessageSubmit(
		nextMessage: string,
		modeOverride?: ChatMode,
	): Promise<void> {
		if (activeSessionId === null || workbench === null) {
			setSessionError(
				"Please open session first before queueing a message",
			);
			return;
		}
		const message: string = nextMessage.trim();
		const additionalContext: AdditionalContextItem[] =
			workbench.composer.additionalContext;
		if (message.length === 0 && additionalContext.length === 0) {
			return;
		}
	
		const previousWorkbench: WorkbenchSnapshot = workbench;
		const skillRefs: string[] = extractEnabledSkillRefs(message, skills);
		const chatMode: ChatMode = modeOverride ?? getChatMode(workbench);
		const pendingPatch: WorkbenchPatch = mergeWorkbenchPatch(
			mergeWorkbenchPatch(
				takePendingWorkbenchPatch(),
				modeOverride === undefined ? {} : { composer: { chatMode } },
			),
			{
				additionalContextAction: { action: "clearUnpinned" },
			},
		);
	
		setWorkbench(
			(
				currentWorkbench: WorkbenchSnapshot | null,
			): WorkbenchSnapshot | null => {
				return currentWorkbench === null
					? currentWorkbench
					: clearUnpinnedComposerContext(currentWorkbench);
			},
		);
	
		try {
			await sendWorkbenchPatch(pendingPatch, false);
			const result = await addQueuedMessage({
				text: message,
				additionalContext,
				mode: chatMode,
				provider: workbench.composer.provider,
				model: workbench.composer.model,
				reasoningEffort:
					workbench.composer.reasoningEffort ?? undefined,
				executionPolicy: "auto",
				outputTarget: getChatOutputTarget(
					chatMode,
					getCurrentWorkspaceId(activeWorkspace, workbench),
				),
				skillRefs,
			});
			applyWorkbench(result.workbench);
			setSessionError(null);
		} catch (error: unknown) {
			setWorkbench(previousWorkbench);
			replaceComposerInput(message, activeSessionId);
			const errorMessage: string =
				error instanceof Error
					? error.message
					: "Failed to queue message";
			setSessionError(errorMessage);
			console.error("[App] queue message failed", error);
		}
	}

	async function handleGuideSubmit(nextMessage: string): Promise<void> {
		if (isNewSessionHome && activeSessionId === null) {
			replaceComposerInput(nextMessage, "home");
			onInfo("Guides can be added after a session starts.");
			return;
		}
		if (activeSessionId === null || workbench === null) {
			setSessionError("Please open session first before adding a guide");
			return;
		}
		const message: string = nextMessage.trim();
		if (message.length === 0) {
			return;
		}
		replaceComposerInput("", activeSessionId);
	
		const pendingPatch: WorkbenchPatch = takePendingWorkbenchPatch();
	
		try {
			await sendWorkbenchPatch(pendingPatch, false);
			const result = await addGuide(
				message,
				getRunControllerRequestId(runState) ?? undefined,
			);
			applyWorkbench(result.workbench);
			setSessionError(null);
		} catch (error: unknown) {
			replaceComposerInput(message, activeSessionId);
			const errorMessage: string =
				error instanceof Error ? error.message : "Failed to add guide";
			setSessionError(errorMessage);
			console.error("[App] add guide failed", error);
		}
	}

	async function handleQueueMessageRemove(queueId: number): Promise<void> {
		if (workbench === null) {
			return;
		}
		const previousWorkbench: WorkbenchSnapshot = workbench;
		setWorkbench(
			(
				currentWorkbench: WorkbenchSnapshot | null,
			): WorkbenchSnapshot | null => {
				return currentWorkbench === null
					? currentWorkbench
					: removeQueuedMessageFromWorkbench(currentWorkbench, queueId);
			},
		);
		try {
			const result = await removeQueuedMessage(queueId);
			applyWorkbench(result.workbench);
		} catch (error: unknown) {
			setWorkbench(previousWorkbench);
			const errorMessage: string =
				error instanceof Error
					? error.message
					: "Failed to remove queued message";
			setSessionError(errorMessage);
			console.error("[App] remove queued message failed", error);
		}
	}
	
	async function handleQueueMessageEdit(
		item: MessageQueueItem,
	): Promise<void> {
		if (workbench === null) {
			return;
		}
	
		const previousWorkbench: WorkbenchSnapshot = workbench;
		const additionalContext: AdditionalContextItem[] =
			item.additionalContext ?? [];
		const pendingPatch: WorkbenchPatch = mergeWorkbenchPatch(
			takePendingWorkbenchPatch(),
			{
				composer: {
					additionalContext,
				},
			},
		);
		replaceComposerInput(item.text, activeSessionIdRef.current ?? "home");
	
		setWorkbench(
			(
				currentWorkbench: WorkbenchSnapshot | null,
			): WorkbenchSnapshot | null => {
				return currentWorkbench === null
					? currentWorkbench
					: editQueuedMessageInWorkbench(currentWorkbench, item);
			},
		);
	
		try {
			await sendWorkbenchPatch(pendingPatch, false);
			const result = await removeQueuedMessage(item.id);
			applyWorkbench(result.workbench);
			setSessionError(null);
		} catch (error: unknown) {
			setWorkbench(previousWorkbench);
			const errorMessage: string =
				error instanceof Error
					? error.message
					: "Failed to edit queued message";
			setSessionError(errorMessage);
			console.error("[App] edit queued message failed", error);
		}
	}
	
	async function handleQueueMessageReorder(
		queueIds: number[],
	): Promise<void> {
		if (workbench === null) {
			return;
		}
		const previousWorkbench: WorkbenchSnapshot = workbench;
		setWorkbench(reorderPendingQueueInWorkbench(workbench, queueIds));
		try {
			const result = await reorderQueuedMessages(queueIds);
			applyWorkbench(result.workbench);
		} catch (error: unknown) {
			setWorkbench(previousWorkbench);
			const errorMessage: string =
				error instanceof Error
					? error.message
					: "Failed to reorder queued messages";
			setSessionError(errorMessage);
			console.error("[App] reorder queued messages failed", error);
		}
	}
	
	async function handleGuideDelete(guideId: string): Promise<void> {
		if (workbench === null) {
			return;
		}
		const previousWorkbench: WorkbenchSnapshot = workbench;
		setWorkbench(removeGuideFromWorkbench(workbench, guideId));
		try {
			const result = await deleteGuide(guideId);
			applyWorkbench(result.workbench);
		} catch (error: unknown) {
			setWorkbench(previousWorkbench);
			const errorMessage: string =
				error instanceof Error
					? error.message
					: "Failed to delete guide";
			setSessionError(errorMessage);
			console.error("[App] delete guide failed", error);
		}
	}
	
	async function handleGuideReorder(guideIds: string[]): Promise<void> {
		if (workbench === null) {
			return;
		}
		const previousWorkbench: WorkbenchSnapshot = workbench;
		setWorkbench(reorderGuidesInWorkbench(workbench, guideIds));
		try {
			const result = await reorderGuides(guideIds);
			applyWorkbench(result.workbench);
		} catch (error: unknown) {
			setWorkbench(previousWorkbench);
			const errorMessage: string =
				error instanceof Error
					? error.message
					: "Failed to reorder guides";
			setSessionError(errorMessage);
			console.error("[App] reorder guides failed", error);
		}
	}
	
	
	return {
		handleQueueMessageSubmit,
		handleGuideSubmit,
		handleQueueMessageRemove,
		handleQueueMessageEdit,
		handleQueueMessageReorder,
		handleGuideDelete,
		handleGuideReorder,
	};
}

export default useComposerQueueController;
