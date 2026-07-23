import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Alert, Button, Collapse, Divider, Empty, Spin, Tooltip, Typography } from "antd";
import type { CollapseProps } from "antd";
import { Decoration, Diff, Hunk, parseDiff, type FileData, type HunkData } from "react-diff-view";
import { fetchWorkspaceGitDiff, type WorkspaceGitDiffResult } from "@/api/workspace-git-diff-api";
import { Icon } from "@/assets/icons";
import BranchActionDialog from "@/features/git/BranchActionDialog";
import CommitActionDialog from "@/features/git/CommitActionDialog";
import CreateBranchDialog from "@/features/git/CreateBranchDialog";
import { useGitActionDialogController } from "@/features/git/useGitActionDialogController";
import styles from "./GitDiffReviewPanel.module.css";

export type GitDiffReviewPanelProps = {
	workspaceId: string;
};

type ParsedDiff = {
	files: FileData[];
	errorMessage: string | null;
};

function formatDiffStats(diff: WorkspaceGitDiffResult): string {
	const branchText: string = diff.branch ?? "Detached HEAD";
	return `${branchText} · ${diff.changedFiles} files · +${diff.additions} -${diff.deletions}`;
}

function getFilePath(file: FileData): string {
	return file.newPath || file.oldPath || "Unknown file";
}

function parsePatch(patch: string): ParsedDiff {
	if (patch.trim().length === 0) {
		return { files: [], errorMessage: null };
	}

	try {
		return {
			files: parseDiff(patch, { nearbySequences: "zip" }),
			errorMessage: null
		};
	} catch (error: unknown) {
		return {
			files: [],
			errorMessage: error instanceof Error ? error.message : "Failed to parse diff."
		};
	}
}

function renderHunk(hunk: HunkData, index: number): ReactElement[] {
	const key: string = `${hunk.content}:${index}`;
	return [
		<Decoration key={`decoration:${key}`}>
			<span className={styles.hunkHeader}>{hunk.content}</span>
		</Decoration>,
		<Hunk key={`hunk:${key}`} hunk={hunk} />
	];
}

function GitDiffReviewPanel({ workspaceId }: GitDiffReviewPanelProps): ReactElement {
	const [diff, setDiff] = useState<WorkspaceGitDiffResult | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const parsedDiff: ParsedDiff = useMemo((): ParsedDiff => parsePatch(diff?.patch ?? ""), [diff?.patch]);
	const diffFileCollapseItems: NonNullable<CollapseProps["items"]> = useMemo((): NonNullable<CollapseProps["items"]> => {
		return parsedDiff.files.map((file: FileData, fileIndex: number): NonNullable<CollapseProps["items"]>[number] => {
			const filePath: string = getFilePath(file);

			return {
				key: `${filePath}:${fileIndex}`,
				label: (
					<Typography.Text className={styles.filePath} title={filePath}>
						{filePath}
					</Typography.Text>
				),
				extra: <span className={styles.fileType}>{file.type}</span>,
				children: file.isBinary || file.hunks.length === 0 ? (
					<Typography.Text type="secondary" className={styles.binaryText}>
						Binary file changed
					</Typography.Text>
				) : (
					<Diff
						viewType="unified"
						diffType={file.type}
						hunks={file.hunks}
						gutterType="default"
						className={styles.diffTable}
					>
						{(hunks: HunkData[]): ReactElement[] => hunks.flatMap(renderHunk)}
					</Diff>
				)
			};
		});
	}, [parsedDiff.files]);
	const defaultDiffActiveKeys: string[] = useMemo((): string[] => {
		return diffFileCollapseItems.map((item): string => String(item?.key ?? ""));
	}, [diffFileCollapseItems]);
	const gitActions = useGitActionDialogController({
		workspaceId,
		onCommitSuccess: loadDiff,
		onBranchSuccess: loadDiff
	});

	async function loadDiff(): Promise<void> {
		setIsLoading(true);
		setErrorMessage(null);
		try {
			const result: WorkspaceGitDiffResult = await fetchWorkspaceGitDiff({ workspaceId });
			setDiff(result);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to load git diff.");
		} finally {
			setIsLoading(false);
		}
	}

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		setIsLoading(true);
		setErrorMessage(null);
		setDiff(null);
		fetchWorkspaceGitDiff({ workspaceId })
			.then((result: WorkspaceGitDiffResult): void => {
				if (!cancelled) {
					setDiff(result);
				}
			})
			.catch((error: unknown): void => {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : "Failed to load git diff.");
				}
			})
			.finally((): void => {
				if (!cancelled) {
					setIsLoading(false);
				}
			});

		return (): void => {
			cancelled = true;
		};
	}, [workspaceId]);

	return (
		<aside className={styles.panel}>
			<header className={styles.header}>
				<div className={styles.titleBlock}>
					{diff !== null && diff.hasGitRepository ? (
						<div>
							<Typography.Text type="secondary" className={styles.meta}>
								{formatDiffStats(diff)}
							</Typography.Text>
						</div>
					) : null}
				</div>
				<Tooltip title="Commit or push">
					<Button
						type="text"
						shape="circle"
						disabled={diff !== null && !diff.hasGitRepository}
						icon={<Icon name="git-commit" />}
						onClick={gitActions.openCommitDialog}
					/>
				</Tooltip>
				<Tooltip title="Refresh git diff">
					<div className={styles.headerActions}>
						<Button
							type="text"
							shape="circle"
							loading={isLoading}
							icon={<Icon name="reload" />}
							onClick={(): void => {
								void loadDiff();
							}}
						/>
					</div>
				</Tooltip>
			</header>

			<Divider size="small" />

			<div className={styles.body}>
				{isLoading && diff === null ? (
					<div className={styles.centerState}>
						<Spin />
					</div>
				) : errorMessage !== null ? (
					<Alert type="error" showIcon={true} title="Diff unavailable" description={errorMessage} />
				) : diff === null ? (
					<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No diff loaded" />
				) : !diff.hasGitRepository ? (
					<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No Git repository" />
				) : diff.patch.trim().length === 0 ? (
					<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No workspace changes" />
				) : (
					<div className={styles.diffContent}>
						{diff.truncated ? (
							<Alert
								type="warning"
								showIcon={true}
								title="Diff truncated"
								description="The patch is too large to show completely."
								className={styles.notice}
							/>
						) : null}
						{parsedDiff.errorMessage !== null ? (
							<>
								<Alert
									type="warning"
									showIcon={true}
									title="Diff parse failed"
									description={parsedDiff.errorMessage}
									className={styles.notice}
								/>
								<pre className={styles.rawPatch}>{diff.patch}</pre>
							</>
						) : (
							<Collapse
								key={diff.generatedAt}
								size="small"
								bordered={false}
								defaultActiveKey={defaultDiffActiveKeys}
								items={diffFileCollapseItems}
								className={styles.fileCollapse}
							/>
						)}
					</div>
				)}
			</div>
			<CommitActionDialog {...gitActions.commitDialogProps} />
			<BranchActionDialog {...gitActions.branchDialogProps} />
			<CreateBranchDialog {...gitActions.createBranchDialogProps} />
		</aside>
	);
}

export default GitDiffReviewPanel;
