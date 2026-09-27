import type { PluginRecord, PluginSource } from "@/platform/rpc/plugin-api";

export function classificationColor(
	classification: PluginRecord["compatibility"]["classification"],
): string {
	if (classification === "native") return "success";
	if (classification === "unsupported") return "error";
	return "default";
}

export function trustColor(trust: PluginRecord["trust"]): string {
	return trust === "trusted"
		? "success"
		: trust === "disabled"
			? "default"
			: "warning";
}

export function sourceLabel(source: PluginSource): string {
	if (source.type === "npm") return `${source.packageName}@${source.version}`;
	if (source.type === "git")
		return `${source.url}#${source.commit.slice(0, 8)}`;
	return source.path;
}
