import { describe, expect, it } from "vitest";
import type { TimelineBodyPart } from "../../../../../src/renderer/src/api/types";
import {
	getTimelineActivityLabel,
	getTimelineActivityStats,
	groupTimelineActivity,
	type TimelineActivityPart
} from "../../../../../src/renderer/src/features/chat/timeline-activity-groups";

function thinking(
	text: string,
	done: boolean = true,
	groupId: string = "activity:request:1",
	partId: string = `thinking:${text}`,
	stats: { editedFiles: number; commands: number; thoughts: number } = { editedFiles: 0, commands: 0, thoughts: 1 }
): Extract<TimelineBodyPart, { type: "thinking" }> {
	return {
		type: "thinking",
		text,
		done,
		activityGroupId: groupId,
		activityPartId: partId,
		activityPartKind: "thinking",
		activityGroupStats: stats
	};
}

function tool(
	toolCallId: string,
	toolName: string,
	args: Record<string, unknown> = {},
	result: Record<string, unknown> = { ok: true },
	groupId: string = "activity:request:1",
	partId: string = `tool:${toolCallId}`,
	stats: { editedFiles: number; commands: number; thoughts: number } = { editedFiles: 0, commands: 0, thoughts: 0 }
): Extract<TimelineBodyPart, { type: "tool" }> {
	return {
		type: "tool",
		tool_call_id: toolCallId,
		activityGroupId: groupId,
		activityPartId: partId,
		activityPartKind: "tool",
		activityGroupStats: stats,
		events: [
			{ type: "tool.call", toolName, args },
			{ type: "tool.result", ...result }
		]
	};
}

const translate = (key: string, options?: Record<string, unknown>): string => {
	if (key === "chat.activityGroup.activeThinking") return "Thinking";
	if (key === "chat.activityGroup.lastThinking") return "Thought process";
	if (key === "chat.terminalPart.commandFallback") return "Terminal command";
	if (key === "chat.tool.labels.mcp_workspace_read_text_file") return "Read file";
	if (key === "chat.tool.labels.mcp_terminal_run_command") return "Run terminal command";
	return `${key}:${String(options?.count ?? "")}`;
};

describe("timeline activity grouping", () => {
	it("groups contiguous thinking, tools, and terminal commands while keeping the order", () => {
		const parts: TimelineBodyPart[] = [
			thinking("inspect the workspace", true, "activity:request:1", "thinking:1", { editedFiles: 0, commands: 1, thoughts: 1 }),
			tool("read-1", "mcp_workspace_read_text_file", { relativePath: "src/index.ts" }, { ok: true }, "activity:request:1", "tool:read-1", { editedFiles: 0, commands: 1, thoughts: 1 }),
			tool("command-1", "mcp_terminal_run_command", { commandLine: "npm test" }, { ok: true }, "activity:request:1", "tool:command-1", { editedFiles: 0, commands: 1, thoughts: 1 })
		];

		const segments = groupTimelineActivity(parts, false);
		expect(segments).toHaveLength(1);
		expect(segments[0]?.type).toBe("activity_group");
		if (segments[0]?.type === "activity_group") {
			expect(segments[0].parts).toHaveLength(3);
			expect(segments[0].stats).toEqual({ editedFiles: 0, commands: 1, thoughts: 1 });
			expect(segments[0].active).toBe(false);
		}
	});

	it("does not group a single activity or cross non-activity boundaries", () => {
		const parts: TimelineBodyPart[] = [
			thinking("first", true, "activity:request:1", "thinking:1", { editedFiles: 0, commands: 0, thoughts: 1 }),
			tool("read-1", "mcp_workspace_read_text_file", {}, { ok: true }, "activity:request:1", "tool:read-1", { editedFiles: 0, commands: 0, thoughts: 1 }),
			{ type: "markdown", text: "visible answer" },
			tool("read-2", "mcp_workspace_read_text_file", {}, { ok: true }, "activity:request:2", "tool:read-2", { editedFiles: 0, commands: 0, thoughts: 0 }),
			tool("read-3", "mcp_workspace_read_text_file", {}, { ok: true }, "activity:request:2", "tool:read-3", { editedFiles: 0, commands: 0, thoughts: 0 })
		];

		const segments = groupTimelineActivity(parts, false);
		expect(segments.map((segment) => segment.type)).toEqual(["activity_group", "part", "activity_group"]);
		if (segments[0]?.type === "activity_group") {
			expect(segments[0].parts).toHaveLength(2);
		}
		if (segments[2]?.type === "activity_group") {
			expect(segments[2].parts).toHaveLength(2);
		}
	});

	it("keeps the summary marker as a hard grouping boundary and marks a trailing live group active", () => {
		const parts: TimelineBodyPart[] = [
			thinking("before summary", true, "activity:request:1", "thinking:1", { editedFiles: 0, commands: 0, thoughts: 1 }),
			tool("read-1", "mcp_workspace_read_text_file", {}, { ok: true }, "activity:request:1", "tool:read-1", { editedFiles: 0, commands: 0, thoughts: 1 }),
			{ type: "summary_start", runId: "run-1", stepId: "step-1", stepRunId: "step-run-1", title: "Summary", foldTitle: "Process" },
			thinking("after summary", false, "activity:request:2", "thinking:1", { editedFiles: 0, commands: 0, thoughts: 1 }),
			tool("read-2", "mcp_workspace_read_text_file", {}, { ok: true }, "activity:request:2", "tool:read-2", { editedFiles: 0, commands: 0, thoughts: 1 })
		];

		const segments = groupTimelineActivity(parts.slice(0, 2), true, false);
		const visibleSegments = groupTimelineActivity(parts.slice(3), true, true);
		expect(segments[0]?.type).toBe("activity_group");
		expect(segments[0]?.type === "activity_group" ? segments[0].active : false).toBe(false);
		expect(visibleSegments[0]?.type).toBe("activity_group");
		expect(visibleSegments[0]?.type === "activity_group" ? visibleSegments[0].active : false).toBe(true);
	});

	it("keeps stable group identity when a tool part receives more events", () => {
		const initial = groupTimelineActivity([
			thinking("first", true, "activity:request:1", "thinking:1", { editedFiles: 0, commands: 0, thoughts: 1 }),
			tool("stable-tool", "mcp_workspace_read_text_file", {}, { ok: true }, "activity:request:1", "tool:stable-tool", { editedFiles: 0, commands: 0, thoughts: 1 })
		], false);
		const updated = groupTimelineActivity([
			thinking("first", true, "activity:request:1", "thinking:1", { editedFiles: 0, commands: 0, thoughts: 1 }),
			{
				...tool("stable-tool", "mcp_workspace_read_text_file", {}, { ok: true }, "activity:request:1", "tool:stable-tool", { editedFiles: 0, commands: 0, thoughts: 1 }),
				events: [
					{ type: "tool.call", toolName: "mcp_workspace_read_text_file" },
					{ type: "tool.progress", toolName: "mcp_workspace_read_text_file" },
					{ type: "tool.result", ok: true }
				]
			}
		], false);

		expect(initial[0]?.type === "activity_group" ? initial[0].id : "").toBe(updated[0]?.type === "activity_group" ? updated[0].id : "");
	});

	it("ignores empty thinking placeholders without splitting a backend tool batch", () => {
		const parts: TimelineBodyPart[] = [
			tool("read-1", "mcp_workspace_read_text_file", {}, { ok: true }, "activity:request:1", "tool:read-1", { editedFiles: 0, commands: 0, thoughts: 0 }),
			thinking("", true, "activity:request:1", "thinking:placeholder", { editedFiles: 0, commands: 0, thoughts: 0 }),
			tool("read-2", "mcp_workspace_read_text_file", {}, { ok: true }, "activity:request:1", "tool:read-2", { editedFiles: 0, commands: 0, thoughts: 0 })
		];

		const segments = groupTimelineActivity(parts, false);
		expect(segments).toHaveLength(1);
		expect(segments[0]?.type).toBe("activity_group");
		if (segments[0]?.type === "activity_group") {
			expect(segments[0].parts).toHaveLength(2);
			expect(segments[0].partIndexes).toEqual([0, 2]);
		}
	});

	it("counts structured edited files by source and ignores failed results", () => {
		const parts: TimelineActivityPart[] = [
			tool("write-1", "mcp_workspace_overwrite_text_file", {}, {
				ok: true,
				fileEditBatch: {
					batchId: "batch-1",
					editedFiles: [
						{ sourceFolderId: "frontend", path: "src/App.tsx" },
						{ sourceFolderId: "frontend", path: "src/index.ts" }
					],
					editedFileCount: 2
				}
			}, "activity:request:1", "tool:write-1", { editedFiles: 2, commands: 0, thoughts: 0 }),
			tool("write-2", "mcp_workspace_overwrite_text_file", {}, {
				ok: true,
				fileEditBatch: {
					batchId: "batch-2",
					editedFiles: [
						{ sourceFolderId: "frontend", path: "src/App.tsx" },
						{ sourceFolderId: "backend", path: "src/App.tsx" }
					],
					editedFileCount: 2
				}
			}, "activity:request:1", "tool:write-2", { editedFiles: 3, commands: 0, thoughts: 0 }),
			tool("write-3", "mcp_workspace_overwrite_text_file", {}, {
				ok: false,
				fileEditBatch: { batchId: "failed", editedFileCount: 5 }
			}, "activity:request:1", "tool:write-3", { editedFiles: 3, commands: 0, thoughts: 0 })
		];

		expect(getTimelineActivityStats(parts)).toEqual({ editedFiles: 3, commands: 0, thoughts: 0 });
	});

	it("uses backend stats instead of recomputing from tool payloads", () => {
		const part = tool("read-1", "mcp_workspace_read_text_file", {}, {
			ok: true,
			fileEditBatch: { editedFileCount: 99 }
		}, "activity:request:1", "tool:read-1", { editedFiles: 2, commands: 4, thoughts: 3 });

		expect(getTimelineActivityStats([part])).toEqual({ editedFiles: 2, commands: 4, thoughts: 3 });
	});

	it("uses structured latest-event labels without exposing raw tool event JSON", () => {
		const terminalPart = tool("command-1", "mcp_terminal_run_command", { commandLine: "echo secret-token" });
		const genericPart = tool("read-1", "mcp_workspace_read_text_file", { relativePath: "src/index.ts" });

		expect(getTimelineActivityLabel(terminalPart, translate)).toBe("echo secret-token");
		expect(getTimelineActivityLabel(genericPart, translate)).toBe("Read file: src/index.ts");
	});
});
