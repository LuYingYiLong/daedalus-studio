import type { Dispatch, SetStateAction } from "react";
import type {
	AdditionalContextItem,
	SessionMetadata,
	WorkbenchPatch,
} from "@/platform/rpc/types";
import type { HomeDraft } from "@/domain/session/home-draft";
import type { HomePageActionProps } from "./home-page-view-model";

export type HomePageWorkspaceActionParams = {
	onAddWindowScreenshot?: () => void;
	activeSessionMetadata: SessionMetadata | null;
	worktreeDisabledReason: string | null;
	setWorkspaceRefreshToken: Dispatch<SetStateAction<number>>;
	setHomeDraft: Dispatch<SetStateAction<HomeDraft>>;
	handleSessionFork: (
		source: SessionMetadata,
		sourceRequestId?: string,
	) => Promise<void>;
	handleAddWorkspaceContext: (kind: "files" | "folder") => Promise<void>;
	handleAddImageFiles: (files: File[]) => Promise<void>;
	handleAddContextFiles: (files: File[]) => Promise<void>;
	patchContext: (
		action: NonNullable<WorkbenchPatch["additionalContextAction"]>,
	) => void;
};

export type HomePageWorkspaceActions = Pick<
	HomePageActionProps,
	| "onForkFromUserMessage"
	| "onWorkspaceRefresh"
	| "onHomeExecutionEnvironmentChange"
	| "onHomeWorktreeSourcesChange"
	| "onAddFiles"
	| "onAddFolder"
	| "onAddImages"
	| "onAddWindowScreenshot"
	| "onAddContextFiles"
	| "onAddContext"
	| "onRemoveContext"
	| "onPinContext"
	| "onClearUnpinnedContext"
>;

export function createHomePageWorkspaceActions({
	onAddWindowScreenshot,
	activeSessionMetadata,
	worktreeDisabledReason,
	setWorkspaceRefreshToken,
	setHomeDraft,
	handleSessionFork,
	handleAddWorkspaceContext,
	handleAddImageFiles,
	handleAddContextFiles,
	patchContext,
}: HomePageWorkspaceActionParams): HomePageWorkspaceActions {
	return {
		onAddWindowScreenshot,
		onForkFromUserMessage: async (requestId: string): Promise<void> => {
			if (activeSessionMetadata === null) {
				return;
			}
			await handleSessionFork(activeSessionMetadata, requestId);
		},
		onWorkspaceRefresh: (): void => {
			setWorkspaceRefreshToken(
				(currentToken: number): number => currentToken + 1,
			);
		},
		onHomeExecutionEnvironmentChange: (
			executionEnvironment: "local" | "worktree",
		): void => {
			if (
				executionEnvironment === "worktree" &&
				worktreeDisabledReason !== null
			) {
				return;
			}
			setHomeDraft(
				(currentDraft: HomeDraft): HomeDraft => ({
					...currentDraft,
					executionEnvironment,
				}),
			);
		},
		onHomeWorktreeSourcesChange: (
			worktreeSources: HomeDraft["worktreeSources"],
		): void => {
			setHomeDraft(
				(currentDraft: HomeDraft): HomeDraft => ({
					...currentDraft,
					worktreeSources,
				}),
			);
		},
		onAddFiles: (): void => {
			void handleAddWorkspaceContext("files");
		},
		onAddFolder: (): void => {
			void handleAddWorkspaceContext("folder");
		},
		onAddImages: (files: File[]): void => {
			void handleAddImageFiles(files);
		},
		onAddContextFiles: (files: File[]): void => {
			void handleAddContextFiles(files);
		},
		onAddContext: (item: AdditionalContextItem): void =>
			patchContext({ action: "addOrReplace", item }),
		onRemoveContext: (contextId: string): void =>
			patchContext({ action: "remove", contextId }),
		onPinContext: (contextId: string, pinned: boolean): void =>
			patchContext({ action: "pin", contextId, pinned }),
		onClearUnpinnedContext: (): void =>
			patchContext({ action: "clearUnpinned" }),
	};
}
