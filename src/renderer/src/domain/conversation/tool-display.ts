import { getToolDisplayTemplate, type ToolDisplayTemplate } from "./tool-display-templates";
export {
	getRegisteredToolDisplayTemplates,
	registerToolDisplayTemplates,
	unregisterToolDisplayTemplates,
} from "./tool-display-templates";
export type {
	ToolDisplayTemplateMap,
} from "./tool-display-templates";

export type ToolDisplayInfo = {
	label: string;
	iconName: string;
	rawName: string;
};

export type ToolDisplayTranslator = (
	key: string,
	options?: Record<string, unknown>,
) => string;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringValue(
	record: Record<string, unknown>,
	key: string,
): string | undefined {
	const value: unknown = record[key];
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

function getNumberValue(
	record: Record<string, unknown>,
	key: string,
): string | undefined {
	const value: unknown = record[key];
	return typeof value === "number" && Number.isFinite(value)
		? String(value)
		: undefined;
}

function getToolName(events: Record<string, unknown>[]): string {
	for (const event of events) {
		const toolName: unknown = event.toolName;
		if (typeof toolName === "string" && toolName.length > 0) {
			return toolName;
		}
	}

	return "tool";
}

function getToolArgs(
	events: Record<string, unknown>[],
): Record<string, unknown> {
	for (const event of [...events].reverse()) {
		if (isRecord(event.args)) {
			if (Object.keys(event.args).length > 0) {
				return event.args;
			}
		}
	}

	return {};
}

function truncateTarget(value: string): string {
	const normalized: string = value.replace(/\s+/g, " ").trim();
	if (normalized.length <= 80) {
		return normalized;
	}

	return `${normalized.slice(0, 36)}...${normalized.slice(-32)}`;
}

function firstStringArg(
	args: Record<string, unknown>,
	keys: string[],
): string | undefined {
	for (const key of keys) {
		const value: string | undefined = getStringValue(args, key);
		if (value !== undefined) {
			return truncateTarget(value);
		}
	}

	return undefined;
}

function getTarget(
	args: Record<string, unknown>,
	target: ToolDisplayTemplate["target"],
): string | undefined {
	if (target === "file") {
		return firstStringArg(args, [
			"relativePath",
			"resourcePath",
			"path",
			"filePath",
			"fileId",
			"fileName",
			"scriptPath",
			"scenePath",
		]);
	}
	if (target === "folder") {
		return firstStringArg(args, [
			"relativePath",
			"path",
			"rootPath",
			"directory",
			"folderPath",
		]);
	}
	if (target === "scene") {
		return firstStringArg(args, [
			"scenePath",
			"resourcePath",
			"relativePath",
			"path",
		]);
	}
	if (target === "setting") {
		return firstStringArg(args, ["key", "setting", "settingKey"]);
	}
	if (target === "query") {
		return firstStringArg(args, [
			"query",
			"prompt",
			"text",
			"search",
			"url",
		]);
	}
	if (target === "command") {
		return firstStringArg(args, ["command", "script", "presetName"]);
	}
	if (target === "preset") {
		return firstStringArg(args, ["presetName", "command", "resourcePath"]);
	}
	if (target === "skill") {
		const scope: string | undefined = getStringValue(args, "scope");
		const slug: string | undefined = getStringValue(args, "slug");
		if (scope !== undefined && slug !== undefined) {
			return `${scope}:${slug}`;
		}
		return firstStringArg(args, ["ref", "slug", "name"]);
	}
	if (target === "node") {
		const nodePath: string | undefined = firstStringArg(args, [
			"nodePath",
			"nodeName",
		]);
		const scriptPath: string | undefined = firstStringArg(args, [
			"scriptPath",
		]);
		if (nodePath !== undefined && scriptPath !== undefined) {
			return `${nodePath} -> ${scriptPath}`;
		}
		return nodePath ?? firstStringArg(args, ["scenePath", "resourcePath"]);
	}
	if (target === "job") {
		return (
			firstStringArg(args, ["jobId", "variablesReference"]) ??
			getNumberValue(args, "variablesReference")
		);
	}
	if (target === "uid" || target === "resource") {
		return firstStringArg(args, [
			"uid",
			"resourceUid",
			"resourcePath",
			"path",
			"relativePath",
		]);
	}

	return undefined;
}

function humanizeToolName(toolName: string): string {
	return toolName
		.replace(/^mcp_/, "")
		.replace(/_/g, " ")
		.replace(/\b\w/g, (letter: string): string => letter.toUpperCase());
}

function getFallbackIcon(toolName: string): string {
	if (
		toolName.includes("search") ||
		toolName.includes("read") ||
		toolName.includes("list") ||
		toolName.includes("get")
	) {
		return toolName.includes("file") || toolName.includes("text")
			? "file-search"
			: "folder-search";
	}
	if (
		toolName.includes("create") ||
		toolName.includes("write") ||
		toolName.includes("replace") ||
		toolName.includes("delete") ||
		toolName.includes("set")
	) {
		return toolName.includes("folder") || toolName.includes("scene")
			? "folder-edit"
			: "file-edit";
	}
	if (toolName.includes("terminal") || toolName.includes("command")) {
		return "terminal";
	}
	if (toolName.includes("skill")) {
		return "skill";
	}
	if (toolName.includes("web")) {
		return "global";
	}
	if (toolName.includes("image")) {
		return "magic";
	}

	return "mcp";
}

function translateToolLabel(
	toolName: string,
	fallback: string,
	t?: ToolDisplayTranslator,
): string {
	if (t === undefined) {
		return fallback;
	}

	const key = `chat.tool.labels.${toolName}`;
	const translated = t(key, { defaultValue: fallback });
	return translated.length > 0 ? translated : fallback;
}

export function getToolDisplayInfo(
	events: Record<string, unknown>[],
	t?: ToolDisplayTranslator,
): ToolDisplayInfo {
	const rawName: string = getToolName(events);
	const args: Record<string, unknown> = getToolArgs(events);
	const template: ToolDisplayTemplate | undefined =
		getToolDisplayTemplate(rawName);

	if (template === undefined) {
		const fallbackLabel = humanizeToolName(rawName);
		return {
			label: translateToolLabel(rawName, fallbackLabel, t),
			iconName: getFallbackIcon(rawName),
			rawName,
		};
	}

	const target: string | undefined = getTarget(args, template.target);
	const label = translateToolLabel(rawName, template.label, t);
	return {
		label: target === undefined ? label : `${label}: ${target}`,
		iconName: template.iconName,
		rawName,
	};
}
