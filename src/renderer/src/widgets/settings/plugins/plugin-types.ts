import type {
	PluginCatalogResult,
	PluginRecord,
	PluginSource,
} from "@/platform/rpc/plugin-api";

export type InstallSourceType = PluginSource["type"];
export type PluginPageProps = {
	catalog: PluginCatalogResult | null;
	selectedPlugin?: PluginRecord;
	busyPluginId: string | null;
	onSelect: (pluginId: string) => void;
	onToggle: (plugin: PluginRecord) => void;
	onTrust: (plugin: PluginRecord, status: "trusted" | "disabled") => void;
	onRemove: (plugin: PluginRecord) => void;
	onRefresh: () => void;
};
