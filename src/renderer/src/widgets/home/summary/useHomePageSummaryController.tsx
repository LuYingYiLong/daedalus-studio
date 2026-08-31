import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CollapseProps } from "antd";
import { Button, Spin, Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import type {
	SessionOverviewGitInfo,
	SessionOverviewPlanItem,
	SessionOverviewResult,
	SessionOverviewSourceItem,
} from "@/platform/rpc/session-overview-api";
import { fetchSessionOverview } from "@/platform/rpc/session-overview-api";
import {
	getPlan,
	type PlanResult,
} from "@/platform/rpc/plan-api";
import type { WorkspaceConfig } from "@/platform/rpc/types";
import type { WorkspaceLaunchTargetId } from "@/domain/workspace/workspace-launch";
import type { MessageInstance } from "antd/es/message/interface";
import { Icon } from "@/assets/icons";
import { useGitActionDialogController } from "@/features/git/useGitActionDialogController";
import { isGodotScenePath, getPathBasename } from "@/domain/session/home-layout-model";
import useSessionSummaryOverview from "@/features/home/summary/useSessionSummaryOverview";
import { formatSourceSubtitle } from "@/domain/session/session-overview-formatters";
import styles from "@/widgets/home/HomePage.module.css";

export const SUMMARY_PREVIEW_LIMIT: number = 3;
export const SUMMARY_SEE_MORE_LIMIT: number = 100;
const MAX_GODOT_SCENE_FILES: number = 500;

export type GodotSceneFile = {
	relativePath: string;
	resourcePath: string;
	name: string;
};

type SummaryGitAction = "diff" | "branch" | "commit";

type SummaryGitActionRequest = {
	id: number;
	action: SummaryGitAction;
	sourceFolderId: string;
};

export type HomePageSummaryControllerParams = {
	activeSessionId: string | null;
	isHome: boolean;
	workspaceForActions: WorkspaceConfig | null;
	effectiveGodotLaunchExecutablePath: string | null;
	messageApi: MessageInstance;
	onWorkspaceRefresh: () => void;
	onOpenReviewPanel: () => void;
	openWorkspaceLaunchTarget: (
		targetId: WorkspaceLaunchTargetId,
		options?: {
			godotRunMode?: "editor" | "project" | "scene";
			godotScenePath?: string;
		},
	) => Promise<void>;
};

type GitActionController = ReturnType<
	typeof useGitActionDialogController
>;

export type HomePageSummaryController = {
	summaryScopeKey: string;
	summaryOpen: boolean;
	summaryOverview: SessionOverviewResult | null;
	isSummaryLoading: boolean;
	summaryError: string | null;
	setSummaryOpen: (open: boolean) => void;
	loadSummaryOverview: ReturnType<typeof useSessionSummaryOverview>["loadSummaryOverview"];
	handleSummaryOpenChange: (open: boolean) => void;
	summaryGitSourceFolderId: string | null;
	gitStateRevision: number;
	handleDockGitStateChange: () => Promise<void>;
	handleGitReviewSourceFolderChange: (sourceFolderId: string | null) => void;
	gitActions: GitActionController;
	showGodotSummaryActions: boolean;
	summaryCollapseItems: NonNullable<CollapseProps["items"]>;
	openPlansModal: () => void;
	plansModalOpen: boolean;
	plansDialogOverview: SessionOverviewResult | null;
	isPlansDialogLoading: boolean;
	plansDialogError: string | null;
	setPlansModalOpen: (open: boolean) => void;
	openPlanPreview: (plan: SessionOverviewPlanItem) => void;
	previewPlan: SessionOverviewPlanItem | null;
	isPlanPreviewLoading: boolean;
	planPreviewError: string | null;
	closePlanPreview: () => void;
	sourcesModalOpen: boolean;
	sourcesDialogOverview: SessionOverviewResult | null;
	isSourcesDialogLoading: boolean;
	sourcesDialogError: string | null;
	closeSourcesModal: () => void;
	previewSource: SessionOverviewSourceItem | null;
	setPreviewSource: (source: SessionOverviewSourceItem | null) => void;
	openGodotSceneModal: () => void;
	closeGodotSceneModal: () => void;
	isGodotSceneModalOpen: boolean;
	filteredGodotSceneFiles: GodotSceneFile[];
	isGodotSceneLoading: boolean;
	godotSceneSearch: string;
	setGodotSceneSearch: (value: string) => void;
	runGodotScene: (scene: GodotSceneFile) => void;
	runGodotProject: () => void;
};

function useHomePageSummaryController({
	activeSessionId,
	isHome,
	workspaceForActions,
	effectiveGodotLaunchExecutablePath,
	messageApi,
	onWorkspaceRefresh,
	onOpenReviewPanel,
	openWorkspaceLaunchTarget,
}: HomePageSummaryControllerParams): HomePageSummaryController {
	const { t } = useTranslation();
	const [summaryGitSourceFolderId, setSummaryGitSourceFolderId] = useState<
		string | null
	>(null);
	const [summaryGitActionRequest, setSummaryGitActionRequest] =
		useState<SummaryGitActionRequest | null>(null);
	const [gitStateRevision, setGitStateRevision] = useState<number>(0);
	const [plansModalOpen, setPlansModalOpen] = useState<boolean>(false);
	const [plansDialogOverview, setPlansDialogOverview] =
		useState<SessionOverviewResult | null>(null);
	const [isPlansDialogLoading, setIsPlansDialogLoading] =
		useState<boolean>(false);
	const [plansDialogError, setPlansDialogError] = useState<string | null>(
		null,
	);
	const [sourcesModalOpen, setSourcesModalOpen] = useState<boolean>(false);
	const [sourcesDialogOverview, setSourcesDialogOverview] =
		useState<SessionOverviewResult | null>(null);
	const [isSourcesDialogLoading, setIsSourcesDialogLoading] =
		useState<boolean>(false);
	const [sourcesDialogError, setSourcesDialogError] = useState<string | null>(
		null,
	);
	const [previewSource, setPreviewSource] =
		useState<SessionOverviewSourceItem | null>(null);
	const [previewPlan, setPreviewPlan] =
		useState<SessionOverviewPlanItem | null>(null);
	const [isPlanPreviewLoading, setIsPlanPreviewLoading] =
		useState<boolean>(false);
	const [planPreviewError, setPlanPreviewError] = useState<string | null>(
		null,
	);
	const [isGodotProject, setIsGodotProject] = useState<boolean>(false);
	const [isGodotSceneModalOpen, setIsGodotSceneModalOpen] =
		useState<boolean>(false);
	const [godotSceneFiles, setGodotSceneFiles] = useState<GodotSceneFile[]>(
		[],
	);
	const [isGodotSceneLoading, setIsGodotSceneLoading] =
		useState<boolean>(false);
	const [godotSceneSearch, setGodotSceneSearch] = useState<string>("");
	const summaryGitActionRequestIdRef = useRef<number>(0);
	const planPreviewRequestIdRef = useRef<number>(0);

	const summarySessionId: string | null = isHome ? null : activeSessionId;
	const summaryScopeKey: string =
		summarySessionId ?? `workspace:${workspaceForActions?.id ?? "none"}`;
	const {
		summaryOpen,
		summaryOverview,
		isSummaryLoading,
		summaryError,
		setSummaryOpen,
		loadSummaryOverview,
		handleSummaryOpenChange,
	} = useSessionSummaryOverview({
		scopeKey: summaryScopeKey,
		sessionId: summarySessionId,
		workspace: workspaceForActions,
		previewLimit: SUMMARY_PREVIEW_LIMIT,
	});

	const openSummaryDiffReview = useCallback((): void => {
		setSummaryOpen(false);
		if (workspaceForActions === null) {
			return;
		}
		onOpenReviewPanel();
	}, [onOpenReviewPanel, setSummaryOpen, workspaceForActions]);

	useEffect((): (() => void) | void => {
		if (
			workspaceForActions === null ||
			effectiveGodotLaunchExecutablePath === null
		) {
			setIsGodotProject(false);
			return;
		}

		let cancelled: boolean = false;
		window.electronAPI.workspaceFs
			.listChildren({
				workspaceRoot: workspaceForActions.rootPath,
				relativePath: "",
			})
			.then((result): void => {
				if (cancelled) {
					return;
				}
				setIsGodotProject(
					result.entries.some(
						(entry): boolean =>
							entry.kind === "file" &&
							entry.name === "project.godot",
					),
				);
			})
			.catch((error: unknown): void => {
				console.error(
					"[HomePageSummary] failed to detect Godot project",
					error,
				);
				if (!cancelled) {
					setIsGodotProject(false);
				}
			});

		return (): void => {
			cancelled = true;
		};
	}, [effectiveGodotLaunchExecutablePath, workspaceForActions]);

	useEffect((): void => {
		setSummaryGitSourceFolderId(null);
		setSummaryGitActionRequest(null);
		setPlansModalOpen(false);
		setPlansDialogOverview(null);
		setIsPlansDialogLoading(false);
		setPlansDialogError(null);
		setSourcesModalOpen(false);
		setSourcesDialogOverview(null);
		setIsSourcesDialogLoading(false);
		setSourcesDialogError(null);
		setIsGodotSceneModalOpen(false);
		setGodotSceneSearch("");
		setPreviewSource(null);
		setPreviewPlan(null);
		setIsPlanPreviewLoading(false);
		setPlanPreviewError(null);
		planPreviewRequestIdRef.current += 1;
	}, [summaryScopeKey]);

	useEffect((): (() => void) | void => {
		if (!plansModalOpen || activeSessionId === null) {
			return;
		}

		let cancelled: boolean = false;
		setIsPlansDialogLoading(true);
		setPlansDialogError(null);
		const frameId: number = window.requestAnimationFrame((): void => {
			void fetchSessionOverview({
				sessionId: activeSessionId,
				planLimit: SUMMARY_SEE_MORE_LIMIT,
				sourceLimit: 0,
				includePlanPreviews: false,
				includeSourceImages: false,
			})
				.then((result: SessionOverviewResult): void => {
					if (!cancelled) {
						setPlansDialogOverview(result);
					}
				})
				.catch((error: unknown): void => {
					if (!cancelled) {
						console.error(
							"[HomePageSummary] failed to load session plans",
							error,
						);
						setPlansDialogError(
							error instanceof Error
								? error.message
								: t("agentPage.summary.errors.load"),
						);
					}
				})
				.finally((): void => {
					if (!cancelled) {
						setIsPlansDialogLoading(false);
					}
				});
		});

		return (): void => {
			cancelled = true;
			window.cancelAnimationFrame(frameId);
		};
	}, [activeSessionId, plansModalOpen, t]);

	useEffect((): (() => void) | void => {
		if (!sourcesModalOpen || activeSessionId === null) {
			return;
		}

		let cancelled: boolean = false;
		setIsSourcesDialogLoading(true);
		setSourcesDialogError(null);
		const frameId: number = window.requestAnimationFrame((): void => {
			void fetchSessionOverview({
				sessionId: activeSessionId,
				planLimit: 0,
				sourceLimit: SUMMARY_SEE_MORE_LIMIT,
				includeSourceImages: false,
			})
				.then((result: SessionOverviewResult): void => {
					if (!cancelled) {
						setSourcesDialogOverview(result);
					}
				})
				.catch((error: unknown): void => {
					if (!cancelled) {
						console.error(
							"[HomePageSummary] failed to load session sources",
							error,
						);
						setSourcesDialogError(
							error instanceof Error
								? error.message
								: t("agentPage.summary.errors.load"),
						);
					}
				})
				.finally((): void => {
					if (!cancelled) {
						setIsSourcesDialogLoading(false);
					}
				});
		});

		return (): void => {
			cancelled = true;
			window.cancelAnimationFrame(frameId);
		};
	}, [activeSessionId, sourcesModalOpen, t]);

	const handleDockGitStateChange = useCallback(async (): Promise<void> => {
		setGitStateRevision((current: number): number => current + 1);
		onWorkspaceRefresh();
		await loadSummaryOverview();
	}, [loadSummaryOverview, onWorkspaceRefresh]);

	const handleGitReviewSourceFolderChange = useCallback(
		(sourceFolderId: string | null): void => {
			setSummaryGitSourceFolderId(sourceFolderId);
			setSummaryGitActionRequest(
				(
					current: SummaryGitActionRequest | null,
				): SummaryGitActionRequest | null =>
					current !== null &&
					current.sourceFolderId !== sourceFolderId
						? null
						: current,
			);
		},
		[],
	);

	const gitActions: GitActionController = useGitActionDialogController({
		workspaceId: workspaceForActions?.id ?? null,
		sourceFolderId: summaryGitSourceFolderId,
		resetKey: summaryScopeKey,
		onBeforeCommitOpen: (): void => {
			setSummaryOpen(false);
		},
		onBeforeBranchOpen: (): void => {
			setSummaryOpen(false);
		},
		onCommitSuccess: handleDockGitStateChange,
		onBranchSuccess: handleDockGitStateChange,
	});

	const requestSummaryGitAction = useCallback(
		(sourceFolderId: string, action: SummaryGitAction): void => {
			setSummaryOpen(false);
			setSummaryGitSourceFolderId(sourceFolderId);
			summaryGitActionRequestIdRef.current += 1;
			setSummaryGitActionRequest({
				id: summaryGitActionRequestIdRef.current,
				action,
				sourceFolderId,
			});
		},
		[setSummaryOpen],
	);

	useEffect((): void => {
		if (
			summaryGitActionRequest === null ||
			summaryGitActionRequest.sourceFolderId !== summaryGitSourceFolderId
		) {
			return;
		}
		if (summaryGitActionRequest.action === "diff") {
			onOpenReviewPanel();
		} else if (summaryGitActionRequest.action === "branch") {
			gitActions.openBranchDialog();
		} else {
			gitActions.openCommitDialog();
		}
		setSummaryGitActionRequest(null);
	}, [
		gitActions.openBranchDialog,
		gitActions.openCommitDialog,
		onOpenReviewPanel,
		summaryGitActionRequest,
		summaryGitSourceFolderId,
	]);

	const summaryEnvInfos: SessionOverviewGitInfo[] =
		useMemo((): SessionOverviewGitInfo[] => {
			if (summaryOverview === null) {
				return [];
			}
			if ((summaryOverview.envInfos?.length ?? 0) > 0) {
				return summaryOverview.envInfos ?? [];
			}
			if (summaryOverview.envInfo === null) {
				return [];
			}
			const fallbackSource =
				workspaceForActions?.sourceFolders.find(
					(source): boolean =>
						source.path === summaryOverview.envInfo?.sourceFolderPath,
				) ??
				workspaceForActions?.sourceFolders.find(
					(source): boolean =>
						source.id === workspaceForActions.primarySourceFolderId,
				) ??
				workspaceForActions?.sourceFolders[0];
			const sourceFolderPath: string =
				summaryOverview.envInfo.sourceFolderPath ||
				fallbackSource?.path ||
				workspaceForActions?.rootPath ||
				"";
			return [
				{
					...summaryOverview.envInfo,
					sourceFolderId:
						summaryOverview.envInfo.sourceFolderId ||
						fallbackSource?.id ||
						"primary",
					sourceFolderPath,
					title:
						summaryOverview.envInfo.title ||
						getPathBasename(sourceFolderPath),
				},
			];
		}, [summaryOverview, workspaceForActions]);

	const loadGodotSceneFiles = useCallback(async (): Promise<void> => {
		if (workspaceForActions === null) {
			setGodotSceneFiles([]);
			return;
		}

		const workspaceRoot: string = workspaceForActions.rootPath;
		setIsGodotSceneLoading(true);
		try {
			const scenes: GodotSceneFile[] = [];
			async function scan(relativePath: string): Promise<void> {
				if (scenes.length >= MAX_GODOT_SCENE_FILES) {
					return;
				}

				const result =
					await window.electronAPI.workspaceFs.listChildren({
						workspaceRoot,
						relativePath,
					});
				const entries = [...result.entries].sort(
					(left, right): number => {
						if (left.kind !== right.kind) {
							return left.kind === "folder" ? -1 : 1;
						}
						return left.relativePath.localeCompare(right.relativePath);
					},
				);

				for (const entry of entries) {
					if (scenes.length >= MAX_GODOT_SCENE_FILES) {
						return;
					}
					if (entry.kind === "folder") {
						if (entry.name === ".godot") {
							continue;
						}
						await scan(entry.relativePath);
						continue;
					}
					if (isGodotScenePath(entry.relativePath)) {
						scenes.push({
							name: entry.name,
							relativePath: entry.relativePath,
							resourcePath: entry.resourcePath,
						});
					}
				}
			}

			await scan("");
			setGodotSceneFiles(scenes);
		} catch (error: unknown) {
			const message: string =
				error instanceof Error
					? error.message
					: t("agentPage.summary.godot.errors.loadScenes");
			console.error(
				"[HomePageSummary] failed to load Godot scenes",
				error,
			);
			void messageApi.error(message);
			setGodotSceneFiles([]);
		} finally {
			setIsGodotSceneLoading(false);
		}
	}, [messageApi, t, workspaceForActions]);

	const openGodotSceneModal = useCallback((): void => {
		setSummaryOpen(false);
		setGodotSceneSearch("");
		setIsGodotSceneModalOpen(true);
		void loadGodotSceneFiles();
	}, [loadGodotSceneFiles, setSummaryOpen]);

	const runGodotProject = useCallback((): void => {
		setSummaryOpen(false);
		void openWorkspaceLaunchTarget("godot", { godotRunMode: "project" });
	}, [openWorkspaceLaunchTarget, setSummaryOpen]);

	const runGodotScene = useCallback(
		(scene: GodotSceneFile): void => {
			setIsGodotSceneModalOpen(false);
			void openWorkspaceLaunchTarget("godot", {
				godotRunMode: "scene",
				godotScenePath: scene.relativePath,
			});
		},
		[openWorkspaceLaunchTarget],
	);

	const showGodotSummaryActions: boolean =
		workspaceForActions !== null &&
		effectiveGodotLaunchExecutablePath !== null &&
		isGodotProject;
	const filteredGodotSceneFiles: GodotSceneFile[] = useMemo((): GodotSceneFile[] => {
		const query: string = godotSceneSearch.trim().toLowerCase();
		if (query.length === 0) {
			return godotSceneFiles;
		}
		return godotSceneFiles.filter((scene: GodotSceneFile): boolean => {
			return (
				scene.relativePath.toLowerCase().includes(query) ||
				scene.name.toLowerCase().includes(query)
			);
		});
	}, [godotSceneFiles, godotSceneSearch]);

	const openPlansModal = useCallback((): void => {
		setSummaryOpen(false);
		setPlansDialogOverview(summaryOverview);
		setPlansDialogError(null);
		setPlansModalOpen(true);
	}, [setSummaryOpen, summaryOverview]);

	const openPlanPreview = useCallback(
		(plan: SessionOverviewPlanItem): void => {
			const requestId: number = ++planPreviewRequestIdRef.current;
			setPreviewPlan(plan);
			setPlanPreviewError(null);
			if (plan.previewMarkdown.trim().length > 0) {
				setIsPlanPreviewLoading(false);
				return;
			}
			if (activeSessionId === null) {
				setIsPlanPreviewLoading(false);
				setPlanPreviewError(t("agentPage.summary.errors.load"));
				return;
			}

			setIsPlanPreviewLoading(true);
			void getPlan(plan.planId, activeSessionId)
				.then((result: PlanResult): void => {
					if (requestId !== planPreviewRequestIdRef.current) {
						return;
					}
					setPreviewPlan({
						...plan,
						title: result.title || plan.title,
						status: result.status,
						updatedAt: result.updatedAt,
						previewMarkdown:
							result.previewMarkdown || result.markdown || "",
					});
				})
				.catch((error: unknown): void => {
					if (requestId === planPreviewRequestIdRef.current) {
						console.error(
							"[HomePageSummary] failed to load plan preview",
							error,
						);
						setPlanPreviewError(
							error instanceof Error
								? error.message
								: t("agentPage.summary.errors.load"),
						);
					}
				})
				.finally((): void => {
					if (requestId === planPreviewRequestIdRef.current) {
						setIsPlanPreviewLoading(false);
					}
				});
		},
		[activeSessionId, t],
	);

	const closePlanPreview = useCallback((): void => {
		planPreviewRequestIdRef.current += 1;
		setPreviewPlan(null);
		setIsPlanPreviewLoading(false);
		setPlanPreviewError(null);
	}, []);

	const openSourcesModal = useCallback((): void => {
		setSummaryOpen(false);
		setSourcesDialogOverview(summaryOverview);
		setSourcesDialogError(null);
		setSourcesModalOpen(true);
	}, [setSummaryOpen, summaryOverview]);

	const closeSourcesModal = useCallback((): void => {
		setSourcesModalOpen(false);
	}, []);

	const summaryCollapseItems: NonNullable<CollapseProps["items"]> = useMemo(
		(): NonNullable<CollapseProps["items"]> => {
			if (summaryOverview === null) {
				return [];
			}

			const items: NonNullable<CollapseProps["items"]> = [];
			for (const envInfo of summaryEnvInfos) {
				const hasDiff: boolean = envInfo.changedFiles > 0;
				const hasDiffStats: boolean =
					envInfo.additions > 0 || envInfo.deletions > 0;
				items.push({
					key: `env_info:${envInfo.sourceFolderId}`,
					label: (
						<Tooltip title={envInfo.sourceFolderPath}>
							{envInfo.title}
						</Tooltip>
					),
					children: (
						<div className={styles.summarySection}>
							<Button
								type="text"
								block
								icon={<Icon name="git-diff" />}
								className={styles.summaryActionButton}
								onClick={(): void =>
									requestSummaryGitAction(
										envInfo.sourceFolderId,
										"diff",
									)
								}
							>
								<span className={styles.diffRow}>
									<span className={styles.diffLabel}>
										{t("agentPage.summary.actions.diff")}
									</span>
									{hasDiffStats ? (
										<>
											<span className={styles.additions}>
												{`+${envInfo.additions}`}
											</span>
											<span className={styles.deletions}>
												{`-${envInfo.deletions}`}
											</span>
										</>
									) : null}
								</span>
							</Button>
							<Button
								type="text"
								block
								icon={<Icon name="git-branch" />}
								className={styles.summaryActionButton}
								onClick={(): void => {
									requestSummaryGitAction(
										envInfo.sourceFolderId,
										"branch",
									);
								}}
							>
								{envInfo.branch ??
									t("agentPage.summary.detachedHead")}
							</Button>
							<Button
								type="text"
								block
								disabled={!hasDiff}
								aria-busy={gitActions.isCommitMessageGenerating}
								icon={
									gitActions.isCommitMessageGenerating ? (
										<Spin size="small" />
									) : (
										<Icon name="git-commit" />
									)
								}
								className={styles.summaryActionButton}
								onClick={(): void => {
									requestSummaryGitAction(
										envInfo.sourceFolderId,
										"commit",
									);
								}}
							>
								{t("agentPage.summary.actions.commitOrPush")}
							</Button>
						</div>
					),
					showArrow: false,
				});
			}

			if (showGodotSummaryActions) {
				items.push({
					key: "godot",
					label: t("agentPage.summary.sections.godot"),
					children: (
						<div className={styles.summarySection}>
							<Button
								type="text"
								block
								icon={<Icon name="play" />}
								className={styles.summaryActionButton}
								onClick={runGodotProject}
							>
								{t("agentPage.summary.godot.runProject")}
							</Button>
							<Button
								type="text"
								block
								icon={<Icon name="scene" />}
								className={styles.summaryActionButton}
								onClick={openGodotSceneModal}
							>
								{t("agentPage.summary.godot.runScene")}
							</Button>
						</div>
					),
					showArrow: false,
				});
			}

			if (summaryOverview.plans.total > 0) {
				items.push({
					key: "plans",
					label: t("agentPage.summary.sections.plans"),
					children: (
						<div className={styles.planList}>
							{summaryOverview.plans.items
								.slice(0, SUMMARY_PREVIEW_LIMIT)
								.map(
									(
										plan: SessionOverviewPlanItem,
									): React.ReactNode => (
										<Button
											key={plan.planId}
											type="text"
											block
											className={styles.summaryActionButton}
											onClick={(): void => {
												setSummaryOpen(false);
												setPreviewPlan(plan);
											}}
										>
											{plan.title}
										</Button>
									),
								)}
							{summaryOverview.plans.total >
							SUMMARY_PREVIEW_LIMIT ? (
								<Button
									type="text"
									block
									icon={<Icon name="external-link" />}
									className={styles.summaryActionButton}
									onClick={openPlansModal}
								>
									{t("agentPage.summary.actions.seeMore")}
								</Button>
							) : null}
						</div>
					),
					showArrow: false,
				});
			}

			if (summaryOverview.sources.total > 0) {
				items.push({
					key: "source",
					label: t("agentPage.summary.sections.source"),
					children: (
						<div className={styles.sourceList}>
							{summaryOverview.sources.items
								.slice(0, SUMMARY_PREVIEW_LIMIT)
								.map(
									(
										source: SessionOverviewSourceItem,
									): React.ReactNode => (
										<Button
											key={`${source.kind}:${source.id}`}
											type="text"
											block
											className={styles.sourceButton}
											icon={
												source.thumbnailDataUrl !== undefined ? (
													<img
														src={source.thumbnailDataUrl}
														alt=""
														className={styles.sourceThumbnail}
													/>
												) : (
													<Icon
														name="txt"
														className={styles.sourceTextIcon}
													/>
												)
												}
											onClick={(): void => {
												setSummaryOpen(false);
												setPreviewSource(source);
											}}
										>
											<span className={styles.sourceText}>
												<span className={styles.summaryItemTitle}>
													{source.title}
												</span>
												<span className={styles.summaryMeta}>
													{formatSourceSubtitle(source, t)}
												</span>
											</span>
										</Button>
									),
								)}
							{summaryOverview.sources.total >
							SUMMARY_PREVIEW_LIMIT ? (
								<Button
									type="text"
									block
									icon={<Icon name="external-link" />}
									className={styles.summaryActionButton}
									onClick={openSourcesModal}
								>
									{t("agentPage.summary.actions.seeMore")}
								</Button>
							) : null}
						</div>
					),
					showArrow: false,
				});
			}

			return items;
		}, [
			gitActions.isCommitMessageGenerating,
			openGodotSceneModal,
			openPlansModal,
			openSourcesModal,
			requestSummaryGitAction,
			runGodotProject,
			showGodotSummaryActions,
			summaryEnvInfos,
			summaryOverview,
			t,
		]);

	return {
		summaryScopeKey,
		summaryOpen,
		summaryOverview,
		isSummaryLoading,
		summaryError,
		setSummaryOpen,
		loadSummaryOverview,
		handleSummaryOpenChange,
		summaryGitSourceFolderId,
		gitStateRevision,
		handleDockGitStateChange,
		handleGitReviewSourceFolderChange,
		gitActions,
		showGodotSummaryActions,
		summaryCollapseItems,
		openPlansModal,
		plansModalOpen,
		plansDialogOverview,
		isPlansDialogLoading,
		plansDialogError,
		setPlansModalOpen,
		openPlanPreview,
		previewPlan,
		isPlanPreviewLoading,
		planPreviewError,
		closePlanPreview,
		sourcesModalOpen,
		sourcesDialogOverview,
		isSourcesDialogLoading,
		sourcesDialogError,
		closeSourcesModal,
		previewSource,
		setPreviewSource,
		openGodotSceneModal,
		closeGodotSceneModal: (): void => setIsGodotSceneModalOpen(false),
		isGodotSceneModalOpen,
		filteredGodotSceneFiles,
		isGodotSceneLoading,
		godotSceneSearch,
		setGodotSceneSearch,
		runGodotScene,
		runGodotProject,
	};
}

export default useHomePageSummaryController;
