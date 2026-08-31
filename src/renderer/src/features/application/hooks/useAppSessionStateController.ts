import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useLatest } from "ahooks";
import type {
	SelectionAskThread,
	SessionMetadata,
	WorkspaceConfig,
	WorkbenchSnapshot,
} from "@/platform/rpc/types";
import {
	createTimelinePageStore,
	useTimelineSelector,
	type TimelinePageStore,
} from "@/domain/workbench/timeline-page-store";
import type { TimelinePageState } from "@/domain/workbench/workbench-state";
import {
	createDefaultSessionLayout,
	type SessionLayoutMap,
	type SessionLayoutPreferences,
} from "@/domain/session/session-layout";
import type { BootstrapData } from "@/domain/application/bootstrap-data";
import type { HomeDraft } from "@/domain/session/home-draft";
import {
	createPreferredHomeDraft,
	getRecentSessions,
} from "@/domain/application/app-helpers";

export type FirstTurnModelTransition = {
	sessionId: string;
	providerId: string;
	modelId: string;
};

export type AppSessionStateController = {
	workspaceRefreshToken: number;
	setWorkspaceRefreshToken: Dispatch<SetStateAction<number>>;
	isNewSessionHome: boolean;
	setIsNewSessionHome: Dispatch<SetStateAction<boolean>>;
	homeComposerMessage: string;
	setHomeComposerMessage: Dispatch<SetStateAction<string>>;
	homeComposerMessageRef: { current: string };
	homeDraft: HomeDraft;
	setHomeDraft: Dispatch<SetStateAction<HomeDraft>>;
	homeDraftRef: { current: HomeDraft };
	homeWorkspaceOptions: WorkspaceConfig[];
	setHomeWorkspaceOptions: Dispatch<SetStateAction<WorkspaceConfig[]>>;
	isWorkspaceProjectDialogOpen: boolean;
	setIsWorkspaceProjectDialogOpen: Dispatch<SetStateAction<boolean>>;
	isWorkspaceSessionCreating: boolean;
	setIsWorkspaceSessionCreating: Dispatch<SetStateAction<boolean>>;
	pendingTextAttachmentCount: number;
	setPendingTextAttachmentCount: Dispatch<SetStateAction<number>>;
	isAddingTextAttachment: boolean;
	isHomeSubmitting: boolean;
	setIsHomeSubmitting: Dispatch<SetStateAction<boolean>>;
	isWorktreePreparing: boolean;
	setIsWorktreePreparing: Dispatch<SetStateAction<boolean>>;
	activeSessionId: string | null;
	setActiveSessionId: Dispatch<SetStateAction<string | null>>;
	firstTurnModelTransition: FirstTurnModelTransition | null;
	setFirstTurnModelTransition: Dispatch<
		SetStateAction<FirstTurnModelTransition | null>
	>;
	sessionLayouts: SessionLayoutMap;
	setSessionLayouts: Dispatch<SetStateAction<SessionLayoutMap>>;
	temporarySessionLayout: SessionLayoutPreferences;
	setTemporarySessionLayout: Dispatch<SetStateAction<SessionLayoutPreferences>>;
	activeSessionIdRef: { current: string | null };
	temporaryDraftSessionIdRef: { current: string | null };
	temporarySessionCreationRef: { current: Promise<void> | null };
	activeSessionMetadata: SessionMetadata | null;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	recentSessions: SessionMetadata[];
	setRecentSessions: Dispatch<SetStateAction<SessionMetadata[]>>;
	recentSessionsRef: { current: SessionMetadata[] };
	activeWorkspace: WorkspaceConfig | null;
	setActiveWorkspace: Dispatch<SetStateAction<WorkspaceConfig | null>>;
	timelineStore: TimelinePageStore;
	timelineBlockCount: number;
	selectionAskThreads: SelectionAskThread[];
	setSelectionAskThreads: Dispatch<SetStateAction<SelectionAskThread[]>>;
	workbench: WorkbenchSnapshot | null;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	activeWorkbenchRef: { current: WorkbenchSnapshot | null };
	sessionError: string | null;
	setSessionError: Dispatch<SetStateAction<string | null>>;
};

export default function useAppSessionStateController({
	bootstrapData,
}: { bootstrapData: BootstrapData }): AppSessionStateController {
	const [workspaceRefreshToken, setWorkspaceRefreshToken] =
		useState<number>(0);
	const [isNewSessionHome, setIsNewSessionHome] = useState<boolean>(true);
	const [homeComposerMessage, setHomeComposerMessage] = useState<string>("");
	const [homeDraft, setHomeDraft] = useState<HomeDraft>(() =>
		createPreferredHomeDraft(
			bootstrapData.clientPreferences,
			bootstrapData.providerModelSelection,
		),
	);
	const homeComposerMessageRef = useLatest(homeComposerMessage);
	const homeDraftRef = useLatest(homeDraft);
	const [homeWorkspaceOptions, setHomeWorkspaceOptions] = useState<
		WorkspaceConfig[]
	>(() => bootstrapData.workspaceList.workspaces);
	const [isWorkspaceProjectDialogOpen, setIsWorkspaceProjectDialogOpen] =
		useState<boolean>(false);
	const [isWorkspaceSessionCreating, setIsWorkspaceSessionCreating] =
		useState<boolean>(false);
	const [pendingTextAttachmentCount, setPendingTextAttachmentCount] =
		useState<number>(0);
	const isAddingTextAttachment: boolean = pendingTextAttachmentCount > 0;
	const [isHomeSubmitting, setIsHomeSubmitting] = useState<boolean>(false);
	const [isWorktreePreparing, setIsWorktreePreparing] =
		useState<boolean>(false);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [firstTurnModelTransition, setFirstTurnModelTransition] = useState<
		FirstTurnModelTransition | null
	>(null);
	const [sessionLayouts, setSessionLayouts] = useState<SessionLayoutMap>(
		() => bootstrapData.sessionLayouts,
	);
	const [temporarySessionLayout, setTemporarySessionLayout] =
		useState<SessionLayoutPreferences>(() => createDefaultSessionLayout());
	const activeSessionIdRef = useRef<string | null>(null);
	const temporaryDraftSessionIdRef = useRef<string | null>(null);
	const temporarySessionCreationRef = useRef<Promise<void> | null>(null);
	const [activeSessionMetadata, setActiveSessionMetadata] =
		useState<SessionMetadata | null>(null);
	const [recentSessions, setRecentSessions] = useState<SessionMetadata[]>(
		() => getRecentSessions(bootstrapData.sessionList.sessions),
	);
	const recentSessionsRef = useLatest(recentSessions);
	useEffect((): (() => void) => {
		return window.electronAPI.sessionCatalog.onChanged((): void => {
			setWorkspaceRefreshToken(
				(currentToken: number): number => currentToken + 1,
			);
		});
	}, []);
	const [activeWorkspace, setActiveWorkspace] =
		useState<WorkspaceConfig | null>(null);
	const timelineStoreRef = useRef<TimelinePageStore | null>(null);
	if (timelineStoreRef.current === null) {
		timelineStoreRef.current = createTimelinePageStore();
	}
	const timelineStore: TimelinePageStore = timelineStoreRef.current;
	const timelineBlockCount: number = useTimelineSelector(
		timelineStore,
		(page: TimelinePageState): number => page.blockCount,
	);
	const [selectionAskThreads, setSelectionAskThreads] = useState<
		SelectionAskThread[]
	>([]);
	const [workbench, setWorkbench] = useState<WorkbenchSnapshot | null>(null);
	const activeWorkbenchRef = useLatest(workbench);
	const [sessionError, setSessionError] = useState<string | null>(null);

	return {
		workspaceRefreshToken,
		setWorkspaceRefreshToken,
		isNewSessionHome,
		setIsNewSessionHome,
		homeComposerMessage,
		setHomeComposerMessage,
		homeComposerMessageRef,
		homeDraft,
		setHomeDraft,
		homeDraftRef,
		homeWorkspaceOptions,
		setHomeWorkspaceOptions,
		isWorkspaceProjectDialogOpen,
		setIsWorkspaceProjectDialogOpen,
		isWorkspaceSessionCreating,
		setIsWorkspaceSessionCreating,
		pendingTextAttachmentCount,
		setPendingTextAttachmentCount,
		isAddingTextAttachment,
		isHomeSubmitting,
		setIsHomeSubmitting,
		isWorktreePreparing,
		setIsWorktreePreparing,
		activeSessionId,
		setActiveSessionId,
		firstTurnModelTransition,
		setFirstTurnModelTransition,
		sessionLayouts,
		setSessionLayouts,
		temporarySessionLayout,
		setTemporarySessionLayout,
		activeSessionIdRef,
		temporaryDraftSessionIdRef,
		temporarySessionCreationRef,
		activeSessionMetadata,
		setActiveSessionMetadata,
		recentSessions,
		setRecentSessions,
		recentSessionsRef,
		activeWorkspace,
		setActiveWorkspace,
		timelineStore,
		timelineBlockCount,
		selectionAskThreads,
		setSelectionAskThreads,
		workbench,
		setWorkbench,
		activeWorkbenchRef,
		sessionError,
		setSessionError,
	};
}
