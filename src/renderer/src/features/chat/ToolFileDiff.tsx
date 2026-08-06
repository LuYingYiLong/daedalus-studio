import { fetchFileEditBatch, type FileEditSnapshot } from "@/api/file-edit-api";
import { Diff, parseDiff } from "react-diff-view";
import { Alert, Spin } from "antd";
import { useEffect, useMemo, useState } from "react";
import { createFileEditUnifiedDiff } from "./file-edit-diff";
import styles from "./ToolPart.module.css";

type ToolFileDiffProps = {
	sessionId: string;
	batchId: string;
};

function ToolFileDiff({ sessionId, batchId }: ToolFileDiffProps): React.JSX.Element {
	const [edits, setEdits] = useState<FileEditSnapshot[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect((): (() => void) => {
		let active: boolean = true;
		setEdits(null);
		setError(null);
		void fetchFileEditBatch(sessionId, batchId).then((result) => {
			if (active) setEdits(result.fileEditBatch.edits);
		}).catch((reason: unknown): void => {
			if (active) setError(reason instanceof Error ? reason.message : "Unable to load file diff.");
		});
		return (): void => { active = false; };
	}, [batchId, sessionId]);

	const parsedEdits = useMemo(() => (edits ?? []).map((edit: FileEditSnapshot) => ({
		edit,
		file: (() => {
			const source: string | null = createFileEditUnifiedDiff(edit);
			return source === null ? null : parseDiff(source)[0] ?? null;
		})()
	})), [edits]);

	if (error !== null) return <Alert type="warning" showIcon message={error} />;
	if (edits === null) return <div className={styles.diffLoading}><Spin size="small" /> Loading diff…</div>;
	return (
		<div className={styles.fileDiffList}>
			{parsedEdits.map(({ edit, file }): React.JSX.Element => (
				<section key={edit.path} className={styles.fileDiff}>
					<div className={styles.fileDiffPath}>
						{edit.sourceFolderId === undefined ? edit.path : `[${edit.sourceFolderId}] ${edit.path}`}
					</div>
					{file === null
						? <div className={styles.diffUnavailable}>{edit.unavailableReason ?? "This edit has no text snapshot to compare."}</div>
						: <Diff diffType={file.type} hunks={file.hunks} viewType="split" />}
				</section>
			))}
		</div>
	);
}

export default ToolFileDiff;
