import { TimelineBodyPart } from "@/api/types";
import ShinyText from "@/components/ShinyText";
import styles from "./ToolPart.module.css"
import { Icon } from "@/assets/icons";
import { Collapse, Tag } from "antd";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getToolDisplayInfo } from "./tool-display";
import { useTimelineDisclosure } from "./timeline-disclosure-state";

export type TimelineToolPart = Extract<TimelineBodyPart, { type: "tool" }>;

type ToolStatus = "running" | "success" | "error" | "approval";

type FileEditBatchSummary = {
	editedFileCount: number;
	additions: number;
	deletions: number;
	editedFiles: FileEditSummaryItem[];
};

type FileEditSummaryItem = {
	path: string;
	additions: number;
	deletions: number;
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFiniteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function hasEventType(events: Record<string, unknown>[], eventTypes: string[]): boolean {
	return events.some((event: Record<string, unknown>): boolean => typeof event.type === "string" && eventTypes.includes(event.type));
}

function getStringValue(event: Record<string, unknown> | undefined, key: string): string | undefined {
	const value: unknown = event?.[key];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getLatestEvent(events: Record<string, unknown>[], type: string): Record<string, unknown> | undefined {
	return [...events].reverse().find((event: Record<string, unknown>): boolean => event.type === type);
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

function getFileEditBatch(events: Record<string, unknown>[]): FileEditBatchSummary | undefined {
	const result: Record<string, unknown> | undefined = getLatestEvent(events, "tool.result");
	if (result === undefined || !isRecord(result.fileEditBatch)) {
		return undefined;
	}

	const batch: Record<string, unknown> = result.fileEditBatch;
	const editedFiles: FileEditSummaryItem[] = Array.isArray(batch.editedFiles)
		? batch.editedFiles.flatMap((value: unknown): FileEditSummaryItem[] => {
			if (!isRecord(value) || typeof value.path !== "string") {
				return [];
			}
			return [{
				path: value.path,
				additions: getFiniteNumber(value.additions) ?? 0,
				deletions: getFiniteNumber(value.deletions) ?? 0
			}];
		})
		: [];
	const editedFileCount: number = getFiniteNumber(batch.editedFileCount) ?? editedFiles.length;
	if (editedFileCount <= 0) {
		return undefined;
	}

	return {
		editedFileCount,
		additions: getFiniteNumber(batch.additions) ?? editedFiles.reduce((total: number, file: FileEditSummaryItem): number => total + file.additions, 0),
		deletions: getFiniteNumber(batch.deletions) ?? editedFiles.reduce((total: number, file: FileEditSummaryItem): number => total + file.deletions, 0),
		editedFiles
	};
}

function getToolStatus(events: Record<string, unknown>[]): ToolStatus {
	if (hasEventType(events, ["tool.error"])) {
		return "error";
	}

	if (hasEventType(events, ["tool.result"])) {
		return "success";
	}

	if (hasEventType(events, ["tool.approved", "tool.call", "tool.progress"])) {
		return "running";
	}

	if (hasEventType(events, ["tool.approval_required"])) {
		return "approval";
	}

	return "running";
}

export type ToolPartProps = {
	part: TimelineToolPart;
	disclosureKey?: string;
}

function ToolPart({ part, disclosureKey = "tool" }: ToolPartProps): React.JSX.Element {
	const { t } = useTranslation();
	const toolDisplay = getToolDisplayInfo(part.events, t);
	const isFileWriteTool: boolean = FILE_WRITE_TOOL_NAMES.has(toolDisplay.rawName);
	const [open, setOpen] = useTimelineDisclosure(disclosureKey, isFileWriteTool);
	const status = getToolStatus(part.events);
	const statusText: Record<ToolStatus, string> = {
		running: t("chat.tool.status.running"),
		success: t("chat.tool.status.done"),
		error: t("chat.tool.status.failed"),
		approval: t("chat.tool.status.approvalRequired"),
	}
	const statusColor: Record<ToolStatus, string> = {
		running: "lime",
		success: "green",
		error: "red",
		approval: "gold"
	}
	const isActiveStatus: boolean = status === "running" || status === "approval";
	const genStatusTag = () => (
		<Tag color={statusColor[status]}>
			{isActiveStatus ? <ShinyText text={statusText[status]} speed={2.4} color="currentColor" /> : statusText[status]}
		</Tag>
	)
	const label = (
		<span className={styles.toolLabel} title={toolDisplay.label}>
			<span className={styles.toolLabelText}>{toolDisplay.label}</span>
		</span>
	);
	const resultText: string = useMemo((): string => getToolResultText(part.events), [part.events]);
	const fileEditBatch: FileEditBatchSummary | undefined = useMemo((): FileEditBatchSummary | undefined => getFileEditBatch(part.events), [part.events]);
	const activityText: string | undefined = status === "running"
		? isFileWriteTool
			? t("chat.tool.activity.writing", { tool: toolDisplay.label })
			: t("chat.tool.activity.running")
		: undefined;
	const hasDetails: boolean = activityText !== undefined || resultText.length > 0 || fileEditBatch !== undefined;
	
	return (
		<Collapse
			size="small"
			bordered={false}
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
							{activityText === undefined ? null : <div className={styles.activityText}>{activityText}</div>}
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
									<ul className={styles.fileList}>
										{fileEditBatch.editedFiles.map((file: FileEditSummaryItem): React.JSX.Element => (
											<li key={file.path} className={styles.fileItem} title={file.path}>
												<span className={styles.filePath}>{file.path}</span>
												<span className={styles.fileStats}>
													<span className={styles.additions}>+{file.additions}</span>
													<span className={styles.deletions}>-{file.deletions}</span>
												</span>
											</li>
										))}
									</ul>
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
