import type { TimelineBodyPart, TimelineEditedFile } from "@/platform/rpc/types";
import { fetchFileEditBatch, type FileEditSnapshot } from "@/platform/rpc/file-edit-api";
import { Button, Card } from "antd";
import styles from "./InlineDiffPart.module.css";
import previewStyles from "./InlineDiffHoverPreview.module.css";
import { Icon } from "@/assets/icons";
import {
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import InlineDiffHoverPreview from "./InlineDiffHoverPreview";
import { getInlineDiffPreviewPosition, type InlineDiffPreviewPosition } from "./inline-diff-preview-model";

export type TimelineInlineDiffPart = Extract<TimelineBodyPart, { type: "inline_diff" }>;
export type InlineDiffPartProps = {
	part: TimelineInlineDiffPart;
	onReview?: () => void;
};

function getFilePath(item: TimelineInlineDiffPart["editedFiles"][number], unknownFileLabel: string): string {
	return item.displayPath ?? item.path ?? item.absolutePath ?? unknownFileLabel;
}

type PreviewTarget = {
	key: string;
	file: TimelineEditedFile;
	filePath: string;
	anchor: HTMLButtonElement;
};

function matchesEditedFile(file: TimelineEditedFile, edit: FileEditSnapshot): boolean {
	const normalize = (path: string): string => path.replaceAll("\\", "/");
	if (file.absolutePath !== undefined && edit.absolutePath !== undefined) {
		return normalize(file.absolutePath) === normalize(edit.absolutePath);
	}
	return (
		(file.sourceFolderId === undefined ||
			edit.sourceFolderId === undefined ||
			file.sourceFolderId === edit.sourceFolderId) &&
		file.path !== undefined &&
		normalize(file.path) === normalize(edit.path)
	);
}

function InlineDiffPart({ part, onReview }: InlineDiffPartProps): React.JSX.Element {
	const { t } = useTranslation();
	const [showAllFiles, setShowAllFiles] = useState<boolean>(false);
	const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
	const [previewPosition, setPreviewPosition] = useState<InlineDiffPreviewPosition | null>(null);
	const hoverTimerRef = useRef<number | null>(null);
	const closeTimerRef = useRef<number | null>(null);
	const hoveredButtonRef = useRef<HTMLButtonElement | null>(null);
	const fileListRef = useRef<HTMLDivElement | null>(null);
	const previewVisibleRef = useRef(false);
	const batchCacheRef = useRef<Map<string, Promise<FileEditSnapshot[]>>>(new Map());
	const batchIdsKey = part.batchIds.join("\u0000");

	const clearHoverTimer = useCallback((): void => {
		if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
		hoverTimerRef.current = null;
	}, []);
	const clearCloseTimer = useCallback((): void => {
		if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
		closeTimerRef.current = null;
	}, []);
	const closePreview = useCallback((): void => {
		clearHoverTimer();
		clearCloseTimer();
		hoveredButtonRef.current = null;
		previewVisibleRef.current = false;
		setPreviewTarget(null);
		setPreviewPosition(null);
	}, [clearHoverTimer, clearCloseTimer]);
	const leaveFileList = useCallback((): void => {
		if (!previewVisibleRef.current) {
			closePreview();
			return;
		}
		clearCloseTimer();
		closeTimerRef.current = window.setTimeout(closePreview, 120);
	}, [clearCloseTimer, closePreview]);
	useEffect((): (() => void) => {
		batchCacheRef.current.clear();
		return (): void => {
			clearHoverTimer();
			clearCloseTimer();
		};
	}, [part.sessionId, clearHoverTimer, clearCloseTimer]);
	useLayoutEffect((): (() => void) | void => {
		if (previewTarget === null) return;
		const updatePosition = (): void => {
			const bounds = previewTarget.anchor.getBoundingClientRect();
			if (!previewTarget.anchor.isConnected || bounds.bottom < 0 || bounds.top > window.innerHeight) {
				closePreview();
				return;
			}
			setPreviewPosition(getInlineDiffPreviewPosition(bounds, window.innerWidth, window.innerHeight));
		};
		updatePosition();
		window.addEventListener("scroll", updatePosition, true);
		window.addEventListener("resize", updatePosition);
		return (): void => {
			window.removeEventListener("scroll", updatePosition, true);
			window.removeEventListener("resize", updatePosition);
		};
	}, [previewTarget, closePreview]);

	const loadEdits = useCallback(
		async (file: TimelineEditedFile): Promise<FileEditSnapshot[]> => {
			const edits: FileEditSnapshot[] = [];
			let firstError: unknown;
			let loadedBatchCount = 0;
			for (const batchId of part.batchIds) {
				const key = `${part.sessionId}:${batchId}`;
				let pending = batchCacheRef.current.get(key);
				if (pending === undefined) {
					pending = fetchFileEditBatch(part.sessionId, batchId).then(
						(result): FileEditSnapshot[] => result.fileEditBatch.edits,
					);
					batchCacheRef.current.set(key, pending);
					if (batchCacheRef.current.size > 8)
						batchCacheRef.current.delete(batchCacheRef.current.keys().next().value!);
				}
				try {
					const batchEdits = await pending;
					loadedBatchCount += 1;
					edits.push(
						...batchEdits.filter((edit: FileEditSnapshot): boolean => matchesEditedFile(file, edit)),
					);
				} catch (error: unknown) {
					batchCacheRef.current.delete(key);
					firstError ??= error;
				}
			}
			if (loadedBatchCount === 0 && firstError !== undefined) throw firstError;
			return edits;
		},
		[part.sessionId, batchIdsKey],
	);

	function showPreview(file: TimelineEditedFile, filePath: string, key: string, anchor: HTMLButtonElement): void {
		clearHoverTimer();
		clearCloseTimer();
		hoveredButtonRef.current = anchor;
		const open = (): void => {
			if (hoveredButtonRef.current !== anchor || !anchor.isConnected) return;
			previewVisibleRef.current = true;
			setPreviewTarget({ file, filePath, key, anchor });
		};
		if (previewVisibleRef.current) open();
		else hoverTimerRef.current = window.setTimeout(open, 1000);
	}

	function leaveButton(anchor: HTMLButtonElement): void {
		if (hoveredButtonRef.current !== anchor || previewVisibleRef.current) return;
		clearHoverTimer();
		hoveredButtonRef.current = null;
	}

	function leavePreview(event: ReactMouseEvent<HTMLDivElement>): void {
		if (event.relatedTarget instanceof Node && fileListRef.current?.contains(event.relatedTarget)) return;
		closePreview();
	}

	const visibleFileLimit: number = 3;
	const hasHiddenFiles: boolean = part.editedFiles.length > visibleFileLimit;
	const visibleFiles =
		showAllFiles || !hasHiddenFiles ? part.editedFiles : part.editedFiles.slice(0, visibleFileLimit);
	const hiddenFileCount: number = Math.max(0, part.editedFiles.length - visibleFileLimit);
	const extra: React.ReactNode = (
		<div>
			<Button type="text" icon={<Icon name="undo" />}>
				{t("chat.inlineDiff.actions.undo")}
			</Button>
			<Button type="text" icon={<Icon name="layout-right" />} onClick={onReview}>
				{t("chat.inlineDiff.actions.review")}
			</Button>
		</div>
	);

	return (
		<>
			<Card
				title={t("chat.inlineDiff.title", { count: part.editedFileCount })}
				className={styles.diffCard}
				extra={extra}
			>
				<div ref={fileListRef} onMouseEnter={clearCloseTimer} onMouseLeave={leaveFileList}>
					<ul className={styles.fileList}>
						{visibleFiles.map((item, index) => {
							const filePath: string = getFilePath(item, t("chat.inlineDiff.unknownFile"));
							const key: string = `${filePath}:${index}`;
							return (
								<li key={`${filePath}:${index}`} className={styles.fileItem}>
									<Button
										type="text"
										className={styles.filePathButton}
										disabled={onReview === undefined}
										title={filePath}
										aria-label={t("chat.inlineDiff.openReviewAria", { filePath })}
										onMouseEnter={(event: ReactMouseEvent<HTMLButtonElement>): void =>
											showPreview(item, filePath, key, event.currentTarget)
										}
										onMouseLeave={(event: ReactMouseEvent<HTMLButtonElement>): void =>
											leaveButton(event.currentTarget)
										}
										onPointerDown={closePreview}
										onClick={onReview}
									>
										<span className={styles.filePath}>{filePath}</span>
										<span className={styles.fileStats}>
											<span className={styles.additions}>+{item.additions ?? 0}</span>
											<span className={styles.deletions}> -{item.deletions ?? 0}</span>
										</span>
									</Button>
								</li>
							);
						})}
					</ul>
				</div>
				{hasHiddenFiles && !showAllFiles && (
					<Button
						type="text"
						size="small"
						className={styles.fileListToggle}
						onClick={(): void => setShowAllFiles(true)}
						aria-expanded={false}
					>
						{t("chat.inlineDiff.showMoreFiles", { count: hiddenFileCount })}
					</Button>
				)}
				{hasHiddenFiles && showAllFiles && (
					<Button
						type="text"
						size="small"
						className={styles.fileListToggle}
						onClick={(): void => {
							closePreview();
							setShowAllFiles(false);
						}}
						aria-expanded={true}
					>
						{t("chat.inlineDiff.collapseFiles")}
					</Button>
				)}
			</Card>
			{previewTarget !== null && previewPosition !== null && typeof document !== "undefined"
				? createPortal(
						<div
							className={previewStyles.previewOverlay}
							style={previewPosition}
							role="tooltip"
							data-file-key={previewTarget.key}
							onMouseEnter={clearCloseTimer}
							onMouseLeave={leavePreview}
						>
							<InlineDiffHoverPreview
								key={previewTarget.key}
								file={previewTarget.file}
								filePath={previewTarget.filePath}
								loadEdits={loadEdits}
							/>
						</div>,
						document.body,
					)
				: null}
		</>
	);
}

export default memo(InlineDiffPart);
