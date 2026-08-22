import builtinTemplatesJson from "./tool-display-templates.json";

export const TOOL_DISPLAY_TARGETS = [
	"file",
	"folder",
	"scene",
	"setting",
	"query",
	"command",
	"preset",
	"skill",
	"node",
	"job",
	"uid",
	"resource",
] as const;

export type ToolDisplayTarget = (typeof TOOL_DISPLAY_TARGETS)[number];

export type ToolDisplayTemplate = {
	label: string;
	iconName: string;
	target?: ToolDisplayTarget;
};

export type ToolDisplayTemplateMap = Record<string, ToolDisplayTemplate>;

const MAX_TEMPLATE_COUNT = 2048;
const MAX_KEY_LENGTH = 160;
const MAX_LABEL_LENGTH = 160;
const MAX_ICON_LENGTH = 80;

const builtinTemplates: ToolDisplayTemplateMap = loadTemplateMap(builtinTemplatesJson);
const pluginTemplates = new Map<string, ToolDisplayTemplateMap>();
const pluginTemplateOwners = new Map<string, string>();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTarget(value: unknown): value is ToolDisplayTarget {
	return typeof value === "string" && (TOOL_DISPLAY_TARGETS as readonly string[]).includes(value);
}

function normalizeTemplate(value: unknown): ToolDisplayTemplate | undefined {
	if (!isRecord(value)) return undefined;
	const label = typeof value.label === "string" ? value.label.trim() : "";
	const iconName = typeof value.iconName === "string" ? value.iconName.trim() : "";
	const target = value.target;
	if (
		label.length === 0 ||
		label.length > MAX_LABEL_LENGTH ||
		iconName.length === 0 ||
		iconName.length > MAX_ICON_LENGTH ||
		(target !== undefined && !isTarget(target))
	) {
		return undefined;
	}
	return target === undefined ? { label, iconName } : { label, iconName, target };
}

function loadTemplateMap(value: unknown): ToolDisplayTemplateMap {
	if (!isRecord(value)) return {};
	const result: ToolDisplayTemplateMap = {};
	for (const [key, template] of Object.entries(value)) {
		if (Object.keys(result).length >= MAX_TEMPLATE_COUNT) break;
		if (key.length === 0 || key.length > MAX_KEY_LENGTH) continue;
		const normalized = normalizeTemplate(template);
		if (normalized !== undefined) result[key] = normalized;
	}
	return result;
}

/**
 * Registers renderer metadata for a future native/Harness plugin.
 * Built-in entries are immutable and plugin entries are namespaced by sourceId.
 */
export function registerToolDisplayTemplates(
	sourceId: string,
	templates: Record<string, unknown>,
): void {
	const normalizedSourceId = sourceId.trim();
	if (!/^[A-Za-z0-9@._:/-]{1,160}$/.test(normalizedSourceId)) {
		throw new Error("Invalid tool display template source id.");
	}
	const normalized = loadTemplateMap(templates);
	const nextSourceMap: ToolDisplayTemplateMap = {};
	const nextKeys = new Set<string>();
	for (const [key, template] of Object.entries(normalized)) {
		const namespacedKey = key.includes(":") ? key : normalizedSourceId + ":" + key;
		if (key.includes(":") && !key.startsWith(normalizedSourceId + ":")) {
			throw new Error("Tool display template must use the source namespace: " + key);
		}
		if (builtinTemplates[namespacedKey] !== undefined) {
			throw new Error("Tool display template conflicts with built-in tool: " + namespacedKey);
		}
		if (nextKeys.has(namespacedKey)) {
			throw new Error("Duplicate tool display template: " + namespacedKey);
		}
		const owner = pluginTemplateOwners.get(namespacedKey);
		if (owner !== undefined && owner !== normalizedSourceId) {
			throw new Error("Tool display template is already registered: " + namespacedKey);
		}
		nextKeys.add(namespacedKey);
		nextSourceMap[namespacedKey] = template;
	}
	const previousSourceMap = pluginTemplates.get(normalizedSourceId);
	if (previousSourceMap !== undefined) {
		for (const key of Object.keys(previousSourceMap)) {
			if (!nextKeys.has(key)) pluginTemplateOwners.delete(key);
		}
	}
	for (const key of nextKeys) pluginTemplateOwners.set(key, normalizedSourceId);
	pluginTemplates.set(normalizedSourceId, nextSourceMap);
}

export function unregisterToolDisplayTemplates(sourceId: string): void {
	const sourceMap = pluginTemplates.get(sourceId);
	if (sourceMap === undefined) return;
	for (const key of Object.keys(sourceMap)) pluginTemplateOwners.delete(key);
	pluginTemplates.delete(sourceId);
}

export function getToolDisplayTemplate(
	rawName: string,
): ToolDisplayTemplate | undefined {
	for (const sourceMap of pluginTemplates.values()) {
		const pluginTemplate = sourceMap[rawName];
		if (pluginTemplate !== undefined) return { ...pluginTemplate };
	}
	const builtinTemplate = builtinTemplates[rawName];
	return builtinTemplate === undefined ? undefined : { ...builtinTemplate };
}

export function getRegisteredToolDisplayTemplates(): ToolDisplayTemplateMap {
	const result: ToolDisplayTemplateMap = {};
	for (const [key, template] of Object.entries(builtinTemplates)) {
		result[key] = { ...template };
	}
	for (const sourceMap of pluginTemplates.values()) {
		for (const [key, template] of Object.entries(sourceMap)) {
			result[key] = { ...template };
		}
	}
	return result;
}
