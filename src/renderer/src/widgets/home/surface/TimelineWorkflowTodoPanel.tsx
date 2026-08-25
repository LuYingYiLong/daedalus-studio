import { useMemo } from "react";
import type {
	AgentGoalState,
	TimelineBlock,
	WorkflowTodoSnapshot,
} from "@/platform/rpc/types";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import { useTimelineSelector } from "@/domain/workbench/timeline-page-store";
import FloatingWorkflowTodoPanel, {
	type WorkflowFileChangeSummary,
} from "@/widgets/composer/FloatingWorkflowTodoPanel";
import FloatingGoalPanel from "@/widgets/composer/FloatingGoalPanel";

type WorkflowFileChangeContribution = WorkflowFileChangeSummary & {
	batchIds: string[];
};

const timelineFileChangeContributionCache: WeakMap<
	TimelineBlock,
	WorkflowFileChangeContribution[]
> = new WeakMap();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordString(record: Record<string, unknown>, key: string): string {
	const value: unknown = record[key];
	return typeof value === "string" ? value : "";
}

function getRecordNumber(record: Record<string, unknown>, key: string): number {
	const value: unknown = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getTimelineFileChangeContributions(
	block: TimelineBlock,
): WorkflowFileChangeContribution[] {
	const cached: WorkflowFileChangeContribution[] | undefined =
		timelineFileChangeContributionCache.get(block);
	if (cached !== undefined) {
		return cached;
	}
	const contributions: WorkflowFileChangeContribution[] = [];
	if (block.type === "assistant") {
		for (const part of block.bodyParts) {
			if (part.type === "inline_diff") {
				contributions.push({
					additions: part.additions,
					deletions: part.deletions,
					changedFiles: part.editedFileCount,
					batchIds: part.batchIds.filter(
						(batchId: string): boolean => batchId.length > 0,
					),
				});
				continue;
			}
			if (part.type !== "tool") {
				continue;
			}
			for (const event of part.events) {
				const fileEditBatch: unknown = event.fileEditBatch;
				if (!isRecord(fileEditBatch)) {
					continue;
				}
				const batchId: string = getRecordString(
					fileEditBatch,
					"batchId",
				);
				contributions.push({
					additions: getRecordNumber(fileEditBatch, "additions"),
					deletions: getRecordNumber(fileEditBatch, "deletions"),
					changedFiles: getRecordNumber(
						fileEditBatch,
						"editedFileCount",
					),
					batchIds: batchId.length > 0 ? [batchId] : [],
				});
			}
		}
	}
	timelineFileChangeContributionCache.set(block, contributions);
	return contributions;
}

function aggregateTimelineFileChanges(
	blocks: TimelineBlock[],
): WorkflowFileChangeSummary {
	const countedBatchIds: Set<string> = new Set();
	let additions: number = 0;
	let deletions: number = 0;
	let changedFiles: number = 0;

	for (const block of blocks) {
		for (const contribution of getTimelineFileChangeContributions(block)) {
			if (
				contribution.batchIds.length > 0 &&
				contribution.batchIds.every((batchId: string): boolean =>
					countedBatchIds.has(batchId),
				)
			) {
				continue;
			}
			additions += contribution.additions;
			deletions += contribution.deletions;
			changedFiles += contribution.changedFiles;
			for (const batchId of contribution.batchIds) {
				countedBatchIds.add(batchId);
			}
		}
	}

	return { additions, deletions, changedFiles };
}

export type TimelineWorkflowTodoPanelProps = {
	timelineStore: TimelinePageStore;
	sessionId: string;
	snapshot: WorkflowTodoSnapshot | null;
	goal: AgentGoalState | null;
	onDismiss: (snapshot: WorkflowTodoSnapshot) => void;
	onGoalChange: (goal: AgentGoalState) => void;
	onGoalDismiss: (goal: AgentGoalState) => Promise<void>;
};

function TimelineWorkflowTodoPanel({
	timelineStore,
	sessionId,
	snapshot,
	goal,
	onDismiss,
	onGoalChange,
	onGoalDismiss,
}: TimelineWorkflowTodoPanelProps): React.JSX.Element | null {
	const timelineBlocks: TimelineBlock[] = useTimelineSelector(
		timelineStore,
		(page): TimelineBlock[] => page.blocks,
	);
	const fileChangeSummary: WorkflowFileChangeSummary = useMemo(
		(): WorkflowFileChangeSummary =>
			aggregateTimelineFileChanges(timelineBlocks),
		[timelineBlocks],
	);

	if (goal !== null) {
		return (
			<FloatingGoalPanel
				goal={goal}
				sessionId={sessionId}
				workflowTodo={snapshot}
				fileChangeSummary={fileChangeSummary}
				onChange={onGoalChange}
				onDismiss={onGoalDismiss}
			/>
		);
	}
	return snapshot === null ? null : (
		<FloatingWorkflowTodoPanel
			snapshot={snapshot}
			fileChangeSummary={fileChangeSummary}
			onDismiss={onDismiss}
		/>
	);
}

export default TimelineWorkflowTodoPanel;
