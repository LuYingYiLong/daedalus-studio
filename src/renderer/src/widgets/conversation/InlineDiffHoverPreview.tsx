import type { TimelineEditedFile } from "@/platform/rpc/types";
import type { FileEditSnapshot } from "@/platform/rpc/file-edit-api";
import { Spin } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildInlineDiffPreviewModel, type InlineDiffPreviewModel } from "./inline-diff-preview-model";
import styles from "./InlineDiffHoverPreview.module.css";

export type InlineDiffHoverPreviewProps = {
	file: TimelineEditedFile;
	filePath: string;
	loadEdits: (file: TimelineEditedFile) => Promise<FileEditSnapshot[]>;
};

type PreviewState =
	| { status: "loading" }
	| { status: "loaded"; edits: FileEditSnapshot[] }
	| { status: "error"; message: string };

function InlineDiffHoverPreview({ file, filePath, loadEdits }: InlineDiffHoverPreviewProps): React.JSX.Element {
	const { t } = useTranslation();
	const [state, setState] = useState<PreviewState>({ status: "loading" });
	useEffect((): (() => void) => {
		let active = true;
		setState({ status: "loading" });
		void loadEdits(file)
			.then((edits: FileEditSnapshot[]): void => {
				if (active) setState({ status: "loaded", edits });
			})
			.catch((error: unknown): void => {
				if (active)
					setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
			});
		return (): void => {
			active = false;
		};
	}, [file, loadEdits]);

	const model: InlineDiffPreviewModel | null = useMemo(
		(): InlineDiffPreviewModel | null =>
			state.status === "loaded" ? buildInlineDiffPreviewModel(state.edits) : null,
		[state],
	);
	return (
		<div className={styles.previewSurface}>
			<div className={styles.previewHeader}>
				<span className={styles.previewPath} title={filePath}>
					{filePath}
				</span>
				<span className={styles.fileStats}>
					<span className={styles.additions}>+{file.additions ?? 0}</span>
					<span className={styles.deletions}> -{file.deletions ?? 0}</span>
				</span>
			</div>
			<div className={styles.previewContent}>
				{state.status === "loading" ? (
					<div className={styles.previewNotice}>
						<Spin size="small" />
						{t("chat.inlineDiff.preview.loading")}
					</div>
				) : null}
				{state.status === "error" ? (
					<div className={styles.previewNotice}>
						{t("chat.inlineDiff.preview.loadFailed")}: {state.message}
					</div>
				) : null}
				{model !== null && model.rows.length === 0 ? (
					<div className={styles.previewNotice}>{t("chat.inlineDiff.preview.unavailable")}</div>
				) : null}
				{model?.rows.map(
					(row, index): React.JSX.Element => (
						<div key={index} className={styles.previewRow} data-kind={row.kind}>
							<span className={styles.previewLineNumber}>{row.lineNumber ?? ""}</span>
							<code className={styles.previewLineText}>{row.text}</code>
						</div>
					),
				)}
			</div>
		</div>
	);
}

export default InlineDiffHoverPreview;
