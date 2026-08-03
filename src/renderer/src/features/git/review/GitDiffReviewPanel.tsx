import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Alert, Button, Collapse, Divider, Empty, Spin, Tooltip, Typography } from "antd";
import type { CollapseProps } from "antd";
import { useTranslation } from "react-i18next";
import {
	Decoration,
	Diff,
	getChangeKey,
	Hunk,
	parseDiff,
	type ChangeData,
	type FileData,
	type GutterOptions,
	type HunkData
} from "react-diff-view";
import {
	fetchWorkspaceGitDiffFile,
	fetchWorkspaceGitDiffSummary,
	type WorkspaceGitDiffFileResult,
	type WorkspaceGitDiffFileSummary,
	type WorkspaceGitDiffSummaryResult
} from "@/api/workspace-git-diff-api";
import type { AdditionalContextItem } from "@/api/types";
import { Icon } from "@/assets/icons";
import BranchActionDialog from "@/features/git/BranchActionDialog";
import CommitActionDialog from "@/features/git/CommitActionDialog";
import CreateBranchDialog from "@/features/git/CreateBranchDialog";
import { useGitActionDialogController } from "@/features/git/useGitActionDialogController";
import GitDiffReviewCommentDialog, { type GitDiffReviewCommentTarget } from "./GitDiffReviewCommentDialog";
import styles from "./GitDiffReviewPanel.module.css";

export type GitDiffReviewPanelProps = {
	workspaceId: string;
	sourceFolderId?: string | null;
	gitStateRevision?: number;
	contextItems: AdditionalContextItem[];
	onAddContext: (item: AdditionalContextItem) => void;
	onRemoveContext: (contextId: string) => void;
	onGitStateChange?: () => void | Promise<void>;
};

type FilePreviewState = {
	status: "loading" | "loaded" | "error";
	result?: WorkspaceGitDiffFileResult;
	errorMessage?: string;
};

type ReviewCommentData = {
	workspaceId?: string;
	oldLine?: number;
	newLine?: number;
	lineText?: string;
	comment?: string;
};

function getDataRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getReviewCommentData(item: AdditionalContextItem): ReviewCommentData {
	const data: Record<string, unknown> = getDataRecord(item.data);
	return {
		workspaceId: typeof data.workspaceId === "string" ? data.workspaceId : undefined,
		oldLine: typeof data.oldLine === "number" ? data.oldLine : undefined,
		newLine: typeof data.newLine === "number" ? data.newLine : undefined,
		lineText: typeof data.lineText === "string" ? data.lineText : undefined,
		comment: typeof data.comment === "string" ? data.comment : item.summary
	};
}

function getFilePath(file: FileData): string {
	return file.newPath || file.oldPath;
}

function createContextId(): string {
	return typeof crypto.randomUUID === "function"
		? `git-review-comment-${crypto.randomUUID()}`
		: `git-review-comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getLineText(change: ChangeData): string {
	return change.content.replace(/^[+-]/u, "").slice(0, 500);
}

function getCommentTarget(filePath: string, change: ChangeData): GitDiffReviewCommentTarget | null {
	if (change.type === "normal") {
		return null;
	}
	return {
		path: filePath,
		oldLine: change.type === "delete" ? change.lineNumber : undefined,
		newLine: change.type === "insert" ? change.lineNumber : undefined,
		lineText: getLineText(change)
	};
}

function parseFilePatch(result: WorkspaceGitDiffFileResult | undefined): FileData | null {
	if (result === undefined || result.patch.trim().length === 0 || result.tooLargeToRender || result.isBinary) {
		return null;
	}
	try {
		return parseDiff(result.patch, { nearbySequences: "zip" })[0] ?? null;
	} catch {
		return null;
	}
}

function renderFileStats(file: WorkspaceGitDiffFileSummary): ReactElement {
	const additions: string = file.additions === null ? "?" : String(file.additions);
	const deletions: string = file.deletions === null ? "?" : String(file.deletions);
	return (
		<span className={styles.fileType}>
			<span className={styles.additions}>+{additions}</span>
			<span className={styles.deletions}>-{deletions}</span>
		</span>
	);
}

function GitDiffReviewPanel({ workspaceId, sourceFolderId = null, gitStateRevision = 0, contextItems, onAddContext, onRemoveContext, onGitStateChange }: GitDiffReviewPanelProps): ReactElement {
	const { t } = useTranslation();
	const [summary, setSummary] = useState<WorkspaceGitDiffSummaryResult | null>(null);
	const [files, setFiles] = useState<WorkspaceGitDiffFileSummary[]>([]);
	const [nextCursor, setNextCursor] = useState<number | null>(null);
	const [previews, setPreviews] = useState<Record<string, FilePreviewState>>({});
	const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
	const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);
	const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [commentTarget, setCommentTarget] = useState<GitDiffReviewCommentTarget | null>(null);

	async function loadFile(path: string, force: boolean = false): Promise<void> {
		if (!force && (previews[path]?.status === "loading" || previews[path]?.status === "loaded")) {
			return;
		}
		setPreviews((current: Record<string, FilePreviewState>): Record<string, FilePreviewState> => ({
			...current,
			[path]: { status: "loading" }
		}));
		try {
			const result: WorkspaceGitDiffFileResult = await fetchWorkspaceGitDiffFile({
				workspaceId,
				sourceFolderId: sourceFolderId ?? undefined,
				path
			});
			setPreviews((current: Record<string, FilePreviewState>): Record<string, FilePreviewState> => ({
				...current,
				[path]: { status: "loaded", result }
			}));
		} catch (error: unknown) {
			setPreviews((current: Record<string, FilePreviewState>): Record<string, FilePreviewState> => ({
				...current,
				[path]: { status: "error", errorMessage: error instanceof Error ? error.message : t("review.errors.loadFile") }
			}));
		}
	}

	async function loadSummary(reset: boolean): Promise<void> {
		if (reset) {
			setIsLoadingSummary(true);
			setErrorMessage(null);
		} else {
			setIsLoadingMore(true);
		}
		try {
			const result: WorkspaceGitDiffSummaryResult = await fetchWorkspaceGitDiffSummary({
				workspaceId,
				sourceFolderId: sourceFolderId ?? undefined,
				cursor: reset ? 0 : nextCursor ?? 0,
				limit: 100
			});
			setSummary(result);
			setNextCursor(result.nextCursor);
			if (reset) {
				setFiles(result.files);
				setPreviews({});
				const autoExpanded: string[] = result.files.filter((file: WorkspaceGitDiffFileSummary): boolean => file.canAutoExpand).slice(0, 3).map((file: WorkspaceGitDiffFileSummary): string => file.path);
				setExpandedKeys(autoExpanded);
				autoExpanded.forEach((path: string): void => {
					void loadFile(path, true);
				});
			} else {
				setFiles((current: WorkspaceGitDiffFileSummary[]): WorkspaceGitDiffFileSummary[] => [...current, ...result.files]);
			}
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("review.errors.loadDiff"));
		} finally {
			setIsLoadingSummary(false);
			setIsLoadingMore(false);
		}
	}

	useEffect((): void => {
		void loadSummary(true);
	}, [gitStateRevision, sourceFolderId, workspaceId]);

	const reviewComments: AdditionalContextItem[] = useMemo((): AdditionalContextItem[] => {
		return contextItems.filter((item: AdditionalContextItem): boolean => {
			return item.kind === "git_diff_comment" && getReviewCommentData(item).workspaceId === workspaceId;
		});
	}, [contextItems, workspaceId]);
	const autoExpandableKeys: string[] = useMemo((): string[] => {
		return files.filter((file: WorkspaceGitDiffFileSummary): boolean => file.canAutoExpand).map((file: WorkspaceGitDiffFileSummary): string => file.path);
	}, [files]);
	const areAllEligibleExpanded: boolean = autoExpandableKeys.length > 0 && autoExpandableKeys.every((key: string): boolean => expandedKeys.includes(key));
	const gitActions = useGitActionDialogController({
		workspaceId,
		sourceFolderId,
		onCommitSuccess: async (): Promise<void> => {
			if (onGitStateChange !== undefined) {
				await onGitStateChange();
			} else {
				await loadSummary(true);
			}
		},
		onBranchSuccess: async (): Promise<void> => {
			if (onGitStateChange !== undefined) {
				await onGitStateChange();
			} else {
				await loadSummary(true);
			}
		}
	});

	function handleCollapseChange(keys: string | string[]): void {
		const nextKeys: string[] = (Array.isArray(keys) ? keys : [keys]).map(String);
		nextKeys.filter((key: string): boolean => !expandedKeys.includes(key)).forEach((path: string): void => {
			void loadFile(path);
		});
		setExpandedKeys(nextKeys);
	}

	function toggleEligibleDiffs(): void {
		if (areAllEligibleExpanded) {
			setExpandedKeys([]);
			return;
		}
		autoExpandableKeys.forEach((path: string): void => { void loadFile(path); });
		setExpandedKeys(autoExpandableKeys);
	}

	function renderComments(filePath: string, hunk: HunkData): Record<string, ReactNode> {
		const widgets: Record<string, ReactNode> = {};
		for (const change of hunk.changes) {
			if (change.type === "normal") {
				continue;
			}
			const matchingComments: AdditionalContextItem[] = reviewComments.filter((item: AdditionalContextItem): boolean => {
				const data: ReviewCommentData = getReviewCommentData(item);
				return item.resourcePath === filePath
					&& data.oldLine === (change.type === "delete" ? change.lineNumber : undefined)
					&& data.newLine === (change.type === "insert" ? change.lineNumber : undefined);
			});
			if (matchingComments.length === 0) {
				continue;
			}
			widgets[getChangeKey(change)] = (
				<div className={styles.reviewComments}>
					{matchingComments.map((item: AdditionalContextItem): ReactElement => (
						<div key={item.id} className={styles.reviewComment}>
							<span>{getReviewCommentData(item).comment ?? item.summary}</span>
							<Button type="text" size="small" icon={<Icon name="remove" />} onClick={(): void => onRemoveContext(item.id)} />
						</div>
					))}
				</div>
			);
		}
		return widgets;
	}

	function renderDiff(file: WorkspaceGitDiffFileSummary, parsedFile: FileData): ReactElement {
		return (
			<Diff
				viewType="unified"
				diffType={parsedFile.type}
				hunks={parsedFile.hunks}
				gutterType="default"
				className={styles.diffTable}
				renderGutter={(options: GutterOptions): ReactNode => {
					const target: GitDiffReviewCommentTarget | null = options.inHoverState ? getCommentTarget(file.path, options.change) : null;
					const shouldShowCommentButton: boolean = target !== null
						&& ((options.change.type === "insert" && options.side === "new")
							|| (options.change.type === "delete" && options.side === "old"));
					return (
						<>
							{options.wrapInAnchor(options.renderDefault())}
							{shouldShowCommentButton ? (
								<Button
									size="small"
									className={styles.addCommentButton}
									aria-label={t("review.commentDialog.open")}
									onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
										event.stopPropagation();
										setCommentTarget(target);
									}}
									icon={<Icon name="add" />}
								/>
							) : null}
						</>
					);
				}}
				widgets={Object.assign({}, ...parsedFile.hunks.map((hunk: HunkData): Record<string, ReactNode> => renderComments(file.path, hunk)))}
			>
				{(hunks: HunkData[]): ReactElement[] => hunks.flatMap((hunk: HunkData, index: number): ReactElement[] => [
					<Decoration key={`decoration:${hunk.content}:${index}`}><span className={styles.hunkHeader}>{hunk.content}</span></Decoration>,
					<Hunk key={`hunk:${hunk.content}:${index}`} hunk={hunk} />
				])}
			</Diff>
		);
	}

	function renderFileContent(file: WorkspaceGitDiffFileSummary): ReactNode {
		if (file.isBinary) {
			return <Typography.Text type="secondary" className={styles.binaryText}>{t("review.binaryFileChanged")}</Typography.Text>;
		}
		const preview: FilePreviewState | undefined = previews[file.path];
		if (preview === undefined || preview.status === "loading") {
			return <div className={styles.fileState}><Spin size="small" /> <Typography.Text type="secondary">{t("review.loadingFile")}</Typography.Text></div>;
		}
		if (preview.status === "error") {
			return <Alert type="warning" showIcon={true} title={t("review.errors.loadFile")} description={preview.errorMessage} />;
		}
		if (preview.result?.tooLargeToRender === true) {
			return <Alert type="info" showIcon={true} title={t("review.fileTooLarge.title")} description={t("review.fileTooLarge.description")} />;
		}
		if (preview.result?.isBinary === true) {
			return <Typography.Text type="secondary" className={styles.binaryText}>{t("review.binaryFileChanged")}</Typography.Text>;
		}
		const parsedFile: FileData | null = parseFilePatch(preview.result);
		return parsedFile === null
			? <Alert type="warning" showIcon={true} title={t("review.notices.diffParseFailed")} />
			: renderDiff(file, parsedFile);
	}

	const collapseItems: NonNullable<CollapseProps["items"]> = files.map((file: WorkspaceGitDiffFileSummary): NonNullable<CollapseProps["items"]>[number] => ({
		key: file.path,
		label: <Typography.Text className={styles.filePath} title={file.path}>{file.path}</Typography.Text>,
		extra: renderFileStats(file),
		children: renderFileContent(file)
	}));

	return (
		<aside className={styles.panel}>
			<header className={styles.header}>
				<div className={styles.titleBlock}>
					{summary?.hasGitRepository ? <Typography.Text type="secondary" className={styles.meta}>{t("review.diffStats", { branch: summary.branch ?? t("git.detachedHead"), count: summary.changedFiles, additions: summary.additions, deletions: summary.deletions })}</Typography.Text> : null}
				</div>
				<Tooltip title={t("git.commit.title")}><Button type="text" shape="circle" disabled={summary !== null && !summary.hasGitRepository} icon={<Icon name="git-commit" />} onClick={gitActions.openCommitDialog} /></Tooltip>
				<div className={styles.headerActions}>
					<Tooltip title={t(areAllEligibleExpanded ? "review.actions.collapseAllDiffs" : "review.actions.expandAllDiffs")}><Button type="text" shape="circle" disabled={autoExpandableKeys.length === 0} icon={<Icon name={areAllEligibleExpanded ? "fold" : "unfold"} />} onClick={toggleEligibleDiffs} /></Tooltip>
					<Tooltip title={t("review.actions.refreshDiff")}><Button type="text" shape="circle" loading={isLoadingSummary} icon={<Icon name="reload" />} onClick={(): void => { void loadSummary(true); }} /></Tooltip>
				</div>
			</header>
			<Divider size="small" />
			<div className={styles.body}>
				{isLoadingSummary && summary === null ? <div className={styles.centerState}><Spin /></div>
					: errorMessage !== null ? <Alert type="error" showIcon={true} title={t("review.empty.diffUnavailable")} description={errorMessage} />
						: summary === null ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("review.empty.noDiffLoaded")} />
							: !summary.hasGitRepository ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("review.empty.noGitRepository")} />
								: files.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("review.empty.noWorkspaceChanges")} />
									: <div className={styles.diffContent}>
										<Collapse size="small" activeKey={expandedKeys} onChange={handleCollapseChange} items={collapseItems} className={styles.fileCollapse} />
										{nextCursor !== null ? <Button block={true} loading={isLoadingMore} onClick={(): void => { void loadSummary(false); }}>{t("review.actions.loadMoreFiles")}</Button> : null}
									</div>}
			</div>
			<GitDiffReviewCommentDialog
				target={commentTarget}
				onCancel={(): void => setCommentTarget(null)}
				onSubmit={(comment: string): void => {
					if (commentTarget === null) {
						return;
					}
					onAddContext({
						id: createContextId(),
						kind: "git_diff_comment",
						title: commentTarget.path,
						subtitle: t("review.commentDialog.contextMeta", { line: commentTarget.newLine ?? commentTarget.oldLine ?? 0 }),
						pinned: true,
						source: "manual",
						resourcePath: commentTarget.path,
						summary: comment,
						data: { workspaceId, oldLine: commentTarget.oldLine, newLine: commentTarget.newLine, lineText: commentTarget.lineText, comment }
					});
					setCommentTarget(null);
				}}
			/>
			<CommitActionDialog {...gitActions.commitDialogProps} />
			<BranchActionDialog {...gitActions.branchDialogProps} />
			<CreateBranchDialog {...gitActions.createBranchDialogProps} />
		</aside>
	);
}

export default GitDiffReviewPanel;
