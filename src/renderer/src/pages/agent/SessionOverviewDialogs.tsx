import type { JSX } from "react";
import { Button, Modal } from "antd";
import type { SessionOverviewPlanItem, SessionOverviewResult, SessionOverviewSourceItem } from "@/api/session-overview-api";
import MarkdownContent from "@/features/markdown/MarkdownContent";
import styles from "./AgentPage.module.css";

export function formatSourceSubtitle(source: SessionOverviewSourceItem): string {
	const dimensions: string = source.width !== undefined && source.height !== undefined
		? `${source.width}x${source.height}`
		: "Unknown size";
	return `${source.mimeType} · ${dimensions}`;
}

function formatOverviewDate(value: string): string {
	if (value.trim().length === 0) {
		return "";
	}
	const date: Date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleString();
}

type SessionOverviewDialogsProps = {
	overview: SessionOverviewResult | null;
	plansOpen: boolean;
	sourcesOpen: boolean;
	previewPlan: SessionOverviewPlanItem | null;
	previewSource: SessionOverviewSourceItem | null;
	onPlansClose: () => void;
	onSourcesClose: () => void;
	onPreviewPlanChange: (plan: SessionOverviewPlanItem | null) => void;
	onPreviewSourceChange: (source: SessionOverviewSourceItem | null) => void;
};

function SessionOverviewDialogs({
	overview,
	plansOpen,
	sourcesOpen,
	previewPlan,
	previewSource,
	onPlansClose,
	onSourcesClose,
	onPreviewPlanChange,
	onPreviewSourceChange
}: SessionOverviewDialogsProps): JSX.Element {
	return (
		<>
			<Modal
				title="Plans"
				open={plansOpen}
				footer={null}
				onCancel={onPlansClose}
				width={640}
			>
				<div className={styles.summaryModalList}>
					{overview?.plans.items.map((plan: SessionOverviewPlanItem): JSX.Element => (
						<Button
							key={plan.planId}
							type="text"
							block
							className={styles.summaryPlanButton}
							onClick={(): void => {
								onPreviewPlanChange(plan);
							}}
						>
							<span className={styles.summaryPlanButtonContent}>
								<span className={styles.summaryItemTitle}>{plan.title}</span>
								<span className={styles.summaryMeta}>
									{plan.status} · {formatOverviewDate(plan.updatedAt)}
								</span>
								<span className={styles.summaryPath}>{plan.planPath}</span>
							</span>
						</Button>
					))}
				</div>
			</Modal>
			<Modal
				title={previewPlan?.title ?? "Plan"}
				open={previewPlan !== null}
				footer={null}
				onCancel={(): void => onPreviewPlanChange(null)}
				width={800}
			>
				{previewPlan !== null ? (
					<div className={`${styles.planPreviewMarkdown} markdown-body`}>
						<MarkdownContent>{previewPlan.previewMarkdown}</MarkdownContent>
					</div>
				) : null}
			</Modal>
			<Modal
				title="Source"
				open={sourcesOpen}
				footer={null}
				onCancel={onSourcesClose}
				width={640}
			>
				<div className={styles.summarySourceGrid}>
					{overview?.sources.items.map((source: SessionOverviewSourceItem): JSX.Element => (
						<Button
							key={`${source.kind}:${source.id}`}
							type="text"
							className={styles.sourceGridButton}
							onClick={(): void => onPreviewSourceChange(source)}
						>
							<img src={source.thumbnailDataUrl} alt="" className={styles.sourceGridThumbnail} />
							<span className={styles.sourceGridText}>
								<span className={styles.summaryItemTitle}>{source.title}</span>
								<span className={styles.summaryMeta}>{formatSourceSubtitle(source)}</span>
							</span>
						</Button>
					))}
				</div>
			</Modal>
			<Modal
				title={previewSource?.title ?? "Image source"}
				open={previewSource !== null}
				footer={null}
				onCancel={(): void => onPreviewSourceChange(null)}
				width={720}
			>
				{previewSource !== null ? (
					<img
						src={previewSource.thumbnailDataUrl}
						alt={previewSource.title}
						className={styles.sourcePreviewImage}
					/>
				) : null}
			</Modal>
		</>
	);
}

export default SessionOverviewDialogs;
