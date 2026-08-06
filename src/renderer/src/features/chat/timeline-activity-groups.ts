import type { TimelineBodyPart } from "@/api/types";
import { getToolDisplayInfo, type ToolDisplayTranslator } from "./tool-display";
import { isTerminalCommandPart, readTerminalDisplay, type TimelineToolPart } from "./tool-part-data";

export type TimelineActivityPart =
	| Extract<TimelineBodyPart, { type: "thinking" }>
	| Extract<TimelineBodyPart, { type: "tool" }>;

export type TimelineActivityStats = {
	editedFiles: number;
	commands: number;
	thoughts: number;
};

export type TimelineActivityGroupSegment = {
	type: "activity_group";
	id: string;
	parts: TimelineActivityPart[];
	partIndexes: number[];
	startIndex: number;
	endIndex: number;
	active: boolean;
	stats: TimelineActivityStats;
	latestPart: TimelineActivityPart;
};

export type TimelineActivityPartSegment = {
	type: "part";
	part: TimelineBodyPart;
	index: number;
};

export type TimelineActivitySegment = TimelineActivityGroupSegment | TimelineActivityPartSegment;

function getActivityGroupId(part: TimelineActivityPart): string {
	return part.activityGroupId?.trim() ?? "";
}

function isEmptyThinkingPart(part: TimelineBodyPart): part is Extract<TimelineBodyPart, { type: "thinking" }> {
	return part.type === "thinking" && part.text.trim().length === 0;
}

function isBackendActivityPart(part: TimelineBodyPart): part is TimelineActivityPart {
	return (part.type === "thinking" || part.type === "tool")
		&& !isEmptyThinkingPart(part)
		&& getActivityGroupId(part).length > 0;
}

function getBackendStats(parts: TimelineActivityPart[]): TimelineActivityStats {
	for (let index: number = parts.length - 1; index >= 0; index -= 1) {
		const stats = parts[index]?.activityGroupStats;
		if (stats !== undefined) {
			return {
				editedFiles: Math.max(0, stats.editedFiles),
				commands: Math.max(0, stats.commands),
				thoughts: Math.max(0, stats.thoughts)
			};
		}
	}
	return { editedFiles: 0, commands: 0, thoughts: 0 };
}

export function getTimelinePartKey(part: TimelineBodyPart, index: number): string {
	if (part.type === "tool" && part.tool_call_id.trim().length > 0) {
		return `tool:${part.tool_call_id}`;
	}
	if (part.type === "thinking") {
		return `thinking:${part.activityPartId ?? index}`;
	}
	if (part.type === "provider_reconnect") {
		return `provider-reconnect:${part.reconnectId}`;
	}
	if (part.type === "compression") {
		return `compression:${part.compressionId}`;
	}
	if (part.type === "summary_start") {
		return `summary:${part.stepRunId || index}`;
	}
	return `${part.type}:${index}`;
}

export function getTimelineActivityStats(parts: TimelineActivityPart[]): TimelineActivityStats {
	return getBackendStats(parts);
}

export function getTimelineActivityLabel(part: TimelineActivityPart, t: ToolDisplayTranslator): string {
	if (part.type === "thinking") {
		return part.done ? t("chat.activityGroup.lastThinking") : t("chat.activityGroup.activeThinking");
	}

	if (isTerminalCommandPart(part)) {
		const commandLine: string = readTerminalDisplay(part as TimelineToolPart).commandLine;
		return commandLine.length > 0 ? commandLine : t("chat.terminalPart.commandFallback");
	}

	return getToolDisplayInfo(part.events, t).label;
}

export function groupTimelineActivity(parts: TimelineBodyPart[], streaming: boolean, isTerminalSegment: boolean = true): TimelineActivitySegment[] {
	const segments: TimelineActivitySegment[] = [];
	let index: number = 0;

	while (index < parts.length) {
		const part: TimelineBodyPart = parts[index] as TimelineBodyPart;
		if (isEmptyThinkingPart(part)) {
			index += 1;
			continue;
		}
		if (!isBackendActivityPart(part)) {
			segments.push({ type: "part", part, index });
			index += 1;
			continue;
		}

		const startIndex: number = index;
		const groupId: string = getActivityGroupId(part);
		const activityParts: TimelineActivityPart[] = [];
		const activityPartIndexes: number[] = [];
		while (index < parts.length) {
			const candidate: TimelineBodyPart = parts[index] as TimelineBodyPart;
			if (isEmptyThinkingPart(candidate)) {
				index += 1;
				continue;
			}
			if (!isBackendActivityPart(candidate) || getActivityGroupId(candidate) !== groupId) {
				break;
			}
			activityParts.push(candidate);
			activityPartIndexes.push(index);
			index += 1;
		}

		if (activityParts.length < 2) {
			activityParts.forEach((activityPart: TimelineActivityPart, offset: number): void => {
				segments.push({ type: "part", part: activityPart, index: activityPartIndexes[offset] as number });
			});
			continue;
		}

		const endIndex: number = index - 1;
		segments.push({
			type: "activity_group",
			id: groupId,
			parts: activityParts,
			partIndexes: activityPartIndexes,
			startIndex,
			endIndex,
			active: streaming && isTerminalSegment && endIndex === parts.length - 1,
			stats: getBackendStats(activityParts),
			latestPart: activityParts[activityParts.length - 1] as TimelineActivityPart
		});
	}

	return segments;
}
