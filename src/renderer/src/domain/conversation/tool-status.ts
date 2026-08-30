import { isTimelineToolEventType } from "./tool-part-data";

export type ToolStatus = "pending" | "running" | "success" | "error" | "approval" | "stopped";

export function getToolStatus(events: readonly Record<string, unknown>[], stopped = false): ToolStatus {
	const latestTerminal = [...events].reverse().find(event =>
		isTimelineToolEventType(event, "tool.result") || isTimelineToolEventType(event, "tool.error"),
	);
	if (latestTerminal) {
		return isTimelineToolEventType(latestTerminal, "tool.error") || latestTerminal.ok === false
			|| latestTerminal.validationStatus === "failed" || latestTerminal.failure !== undefined
			? "error" : "success";
	}
	// 取消可能只有轮次终态而没有工具结果；不能继续显示运行，也不能推断执行成功
	if (stopped) return "stopped";
	const approvalIndex = events.findLastIndex(event => isTimelineToolEventType(event, "tool.approval_required"));
	const executionIndex = events.findLastIndex(event =>
		isTimelineToolEventType(event, "tool.approved") || isTimelineToolEventType(event, "tool.progress")
		|| isTimelineToolEventType(event, "tool.call") && event.preview !== true,
	);
	if (approvalIndex > executionIndex) return "approval";
	return executionIndex >= 0 ? "running" : "pending";
}
