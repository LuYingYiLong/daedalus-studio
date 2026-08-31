import { TimelineBodyPart } from "@/platform/rpc/types";
import ShinyText from "@/ui/ShinyText";
import styles from "./ToolPart.module.css"
import { Icon } from "@/assets/icons";
import { Collapse, Tag } from "antd";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getToolDisplayInfo } from "@/domain/conversation/tool-display";
import { getToolStatus, type ToolStatus } from "@/domain/conversation/tool-status";
import { useTimelineDisclosure } from "@/widgets/conversation/state/timeline-disclosure-state";
import ToolFileDiff from "./ToolFileDiff";
import { getFileEditBatch, getSourceFolderId, getToolRecovery, isTimelineToolEventType, type FileEditBatchSummary, type FileEditSummaryItem, type ToolRecoveryDisplay } from "@/domain/conversation/tool-part-data";

export type TimelineToolPart = Extract<TimelineBodyPart, { type: "tool" }>;

const FILE_WRITE_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
	"mcp_workspace_create_text_file",
	"mcp_workspace_overwrite_text_file",
	"mcp_workspace_replace_text_in_file",
	"mcp_workspace_replace_line_in_file",
	"mcp_workspace_delete_file",
	"mcp_godot_create_text_file",
	"mcp_godot_overwrite_text_file",
	"mcp_godot_replace_text_in_file",
	"mcp_godot_delete_file",
	"mcp_godot_create_scene",
	"mcp_godot_add_node_to_scene",
	"mcp_godot_attach_script_to_node",
	"mcp_godot_connect_signal_in_scene",
	"mcp_godot_apply_scene_patch",
	"mcp_godot_editor_apply_scene_patch",
	"mcp_godot_set_project_setting",
	"mcp_godot_unset_project_setting"
]);

function getStringValue(event: Record<string, unknown> | undefined, key: string): string | undefined {
	const value: unknown = event?.[key];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getLatestEvent(events: Record<string, unknown>[], type: "tool.result" | "tool.error"): Record<string, unknown> | undefined {
	return [...events].reverse().find((event: Record<string, unknown>): boolean => isTimelineToolEventType(event, type));
}

function getToolResultText(events: Record<string, unknown>[]): string {
	const result: Record<string, unknown> | undefined = getLatestEvent(events, "tool.result");
	if (result !== undefined) {
		const summary: string | undefined = getStringValue(result, "summary");
		const failedChecks: string[] = Array.isArray(result.failedChecks)
			? result.failedChecks.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
			: [];
		return [summary, ...failedChecks].filter((value: string | undefined): value is string => value !== undefined).join("\n");
	}

	const error: Record<string, unknown> | undefined = getLatestEvent(events, "tool.error");
	return getStringValue(error, "message") ?? "";
}

function getCompactedFilePaths(events: Record<string, unknown>[]): string[] {
	for (const event of [...events].reverse()) {
		if (!Array.isArray(event.filePaths)) {
			continue;
		}
		return event.filePaths.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0);
	}
	return [];
}

function getCompactedSummary(events: Record<string, unknown>[]): string {
	const latest: Record<string, unknown> | undefined = [...events].reverse().find((event: Record<string, unknown>): boolean => (
		typeof event.summary === "string"
		|| Array.isArray(event.failedChecks)
		|| typeof event.message === "string"
		|| typeof event.reason === "string"
	));
	if (latest === undefined) {
		return "";
	}
	const failedChecks: string[] = Array.isArray(latest.failedChecks)
		? latest.failedChecks.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
		: [];
	return [
		getStringValue(latest, "summary"),
		...failedChecks,
		getStringValue(latest, "message"),
		getStringValue(latest, "reason")
	].filter((value: string | undefined): value is string => value !== undefined).join("\n");
}

export type ToolPartProps = {
	part: TimelineToolPart;
	disclosureKey?: string;
	stopped?: boolean;
}

function ToolPart({ part, disclosureKey = "tool", stopped = false }: ToolPartProps): React.JSX.Element {
	const { t } = useTranslation();
	const isCompacted: boolean = part.detailLevel === "compacted";
	const toolDisplay = getToolDisplayInfo(part.events, t);
	const isFileWriteTool: boolean = FILE_WRITE_TOOL_NAMES.has(toolDisplay.rawName);
	const [open, setOpen] = useTimelineDisclosure(disclosureKey, false);
	const status = getToolStatus(part.events, stopped);
	const statusText: Record<ToolStatus, string> = {
		pending: t("chat.tool.status.pending"),
		running: t("chat.tool.status.running"),
		success: t("chat.tool.status.done"),
		error: t("chat.tool.status.failed"),
		approval: t("chat.tool.status.approvalRequired"),
		stopped: t("chat.tool.status.stopped"),
	}
	const statusColor: Record<ToolStatus, string> = {
		pending: "default",
		running: "lime",
		success: "green",
		error: "red",
		approval: "gold",
		stopped: "default"
	}
	const isActiveStatus: boolean = status === "running" || status === "approval";
	const genStatusTag = () => (
		<Tag color={statusColor[status]}>
			{isActiveStatus ? <ShinyText text={statusText[status]} speed={2.4} color="currentColor" /> : statusText[status]}
		</Tag>
	)
	const resultText: string = useMemo((): string => isCompacted ? "" : getToolResultText(part.events), [isCompacted, part.events]);
	const compactedFilePaths: string[] = useMemo((): string[] => isCompacted ? getCompactedFilePaths(part.events) : [], [isCompacted, part.events]);
	const compactedResultSummary: string = useMemo((): string => isCompacted ? getCompactedSummary(part.events) : "", [isCompacted, part.events]);
	const fileEditBatch: FileEditBatchSummary | undefined = useMemo((): FileEditBatchSummary | undefined => getFileEditBatch(part.events), [part.events]);
	const recovery: ToolRecoveryDisplay | undefined = useMemo((): ToolRecoveryDisplay | undefined => getToolRecovery(part.events), [part.events]);
	const recoveryText: string | undefined = recovery === undefined
		? undefined
		: recovery.status === "recovered"
			? t("chat.tool.recovery.recovered", { attempt: recovery.attempt, max: recovery.maxAttempts })
			: recovery.status === "exhausted"
				? t("chat.tool.recovery.exhausted", { attempt: recovery.attempt, max: recovery.maxAttempts })
				: t("chat.tool.recovery.failed", { attempt: recovery.attempt, max: recovery.maxAttempts });
	const label = (
		<span className={styles.toolLabel} title={toolDisplay.label}>
			<span className={styles.toolLabelText}>{((): string => {
				const sourceFolderId: string | undefined = fileEditBatch?.sourceFolderId ?? getSourceFolderId(part.events);
				return sourceFolderId === undefined ? toolDisplay.label : `[${sourceFolderId}] ${toolDisplay.label}`;
			})()}</span>
			{fileEditBatch === undefined ? null : (
				<span className={styles.fileStats}>
					<span className={styles.additions}>+{fileEditBatch.additions}</span>
					<span className={styles.deletions}>-{fileEditBatch.deletions}</span>
				</span>
			)}
		</span>
	);
	const activityText: string | undefined = status === "running"
		? isFileWriteTool
			? t("chat.tool.activity.writing", { tool: toolDisplay.label })
			: t("chat.tool.activity.running")
		: status === "pending"
			? t("chat.tool.activity.pending")
		: undefined;
	const hasDetails: boolean = isCompacted || activityText !== undefined || resultText.length > 0 || fileEditBatch !== undefined || recoveryText !== undefined;

	return (
		<Collapse
			size="small"
			bordered={false}
			ghost
			destroyOnHidden={true}
			activeKey={open ? ["tool"] : []}
			onChange={(keys: string | string[]): void => {
				setOpen((Array.isArray(keys) ? keys : [keys]).includes("tool"));
			}}
			className={styles.toolCollapse}
			expandIcon={() => (
				<Icon name={toolDisplay.iconName} className={styles.toolIcon} />
			)}
			items={[
				{
					key: "tool",
					label,
					children: !hasDetails ? null : (
						<div className={styles.details}>
							{isCompacted ? <div className={styles.activityText}>{part.compactedSummary ?? t("chat.tool.compactedDetails")}</div> : null}
							{compactedResultSummary.length === 0 ? null : <div className={styles.resultText}>{compactedResultSummary}</div>}
							{compactedFilePaths.length === 0 ? null : (
								<ul className={styles.fileList}>
									{compactedFilePaths.map((filePath: string): React.JSX.Element => <li key={filePath} className={styles.fileItem}>{filePath}</li>)}
								</ul>
							)}
							{activityText === undefined ? null : <div className={styles.activityText}>{activityText}</div>}
							{recoveryText === undefined ? null : <div className={styles.recoveryText}>{recoveryText}</div>}
							{resultText.length === 0 ? null : <div className={styles.resultText}>{resultText}</div>}
							{fileEditBatch === undefined ? null : (
								<div className={styles.fileChanges}>
									<div className={styles.fileChangesSummary}>
										<span>{t("chat.tool.fileChanges.summary", { count: fileEditBatch.editedFileCount })}</span>
										<span className={styles.fileStats}>
											<span className={styles.additions}>+{fileEditBatch.additions}</span>
											<span className={styles.deletions}>-{fileEditBatch.deletions}</span>
										</span>
									</div>
									{fileEditBatch.sessionId === undefined || isCompacted ? (
										<ul className={styles.fileList}>
											{fileEditBatch.editedFiles.map((file: FileEditSummaryItem): React.JSX.Element => (
																				<li key={`${file.sourceFolderId ?? ""}:${file.path}`} className={styles.fileItem}>{file.sourceFolderId === undefined ? file.path : `[${file.sourceFolderId}] ${file.path}`}</li>
											))}
										</ul>
									) : <ToolFileDiff sessionId={fileEditBatch.sessionId} batchId={fileEditBatch.batchId} />}
								</div>
							)}
						</div>
					),
					extra: genStatusTag()
				}
			]}
		/>
	);
}

export default React.memo(ToolPart);
