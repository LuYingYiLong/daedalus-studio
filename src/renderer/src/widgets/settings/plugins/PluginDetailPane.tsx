import { Alert, Button, Flex, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import SettingsItem from "@/ui/SettingsItem";
import SettingsList from "@/ui/SettingsList";
import type { PluginRecord } from "@/platform/rpc/plugin-api";
import { classificationColor, sourceLabel, trustColor } from "./plugin-formatters";
import { PluginRuntimeSection } from "./PluginRuntimeSection";
import { PluginLogList } from "./PluginLogList";
import styles from "./plugins.module.css";

export function PluginDetailPane({ plugin, busy, onToggle, onTrust, onRequestTrust, onRemove, onRestart, onStop, onInstallDependencies, logs }: { plugin?: PluginRecord; busy: boolean; onToggle: (plugin: PluginRecord) => void; onTrust: (plugin: PluginRecord, status: "trusted" | "disabled") => void; onRequestTrust: (plugin: PluginRecord) => void; onRemove: (plugin: PluginRecord) => void; onRestart: () => void; onStop: () => void; onInstallDependencies: () => void; logs: import("@/platform/rpc/plugin-api").PluginRuntimeLog[] }): React.JSX.Element {
	const { t } = useTranslation();
	if (plugin === undefined) return <div className={styles.emptyDetail}><Typography.Text type="secondary">{t("settings.plugins.selectPrompt")}</Typography.Text></div>;
	return <div className={styles.pluginDetailPane}>
		<div className={styles.detailHeader}><div><Typography.Title level={4} className={styles.detailTitle}>{plugin.packageName}</Typography.Title><Typography.Text type="secondary">{plugin.version}</Typography.Text></div><Tag color={classificationColor(plugin.compatibility.classification)}>{t(`settings.plugins.classification.${plugin.compatibility.classification}`)}</Tag></div>
		<SettingsList title={t("settings.plugins.sections.status")}>
			<SettingsItem title={t("settings.plugins.items.source")} description={sourceLabel(plugin.source)}><Tag>{plugin.source.type}</Tag></SettingsItem>
			<SettingsItem title={t("settings.plugins.items.trust")} description={t(`settings.plugins.trust.${plugin.trust}`)}><Space><Tag color={trustColor(plugin.trust)}>{t(`settings.plugins.trust.${plugin.trust}`)}</Tag><Button size="small" loading={busy} onClick={(): void => plugin.trust === "trusted" ? onTrust(plugin, "disabled") : onRequestTrust(plugin)}>{t(plugin.trust === "trusted" ? "settings.plugins.actions.disable" : "settings.plugins.actions.trust")}</Button></Space></SettingsItem>
			<SettingsItem title={t("settings.plugins.items.enabled")} description={t("settings.plugins.items.enabledDescription")}><Button size="small" disabled={plugin.trust !== "trusted"} loading={busy} onClick={(): void => onToggle(plugin)}>{plugin.enabled ? t("settings.common.disable") : t("settings.common.enable")}</Button></SettingsItem>
		</SettingsList>
		<SettingsList title={t("settings.plugins.sections.nativeRuntime")}>
			<SettingsItem title={t("settings.plugins.items.nativeEntry")} description={plugin.nativePlugin?.entry ?? t("settings.plugins.items.notDeclared")}><Tag color={plugin.nativePlugin ? "success" : "default"}>{plugin.nativePlugin ? t("settings.plugins.yes") : t("settings.plugins.no")}</Tag></SettingsItem>
			<SettingsItem title={t("settings.plugins.items.capabilities")} description={plugin.nativePlugin?.capabilities.join(", ") ?? t("settings.plugins.items.notDeclared")}><Tag>{plugin.nativePlugin?.apiVersion ? `API ${plugin.nativePlugin.apiVersion}` : "—"}</Tag></SettingsItem>
		</SettingsList>
		<PluginRuntimeSection plugin={plugin} busy={busy} onRestart={onRestart} onStop={onStop} onInstallDependencies={onInstallDependencies} />
		<SettingsList title={t("settings.plugins.sections.compatibility")}>
			<SettingsItem title={t("settings.plugins.items.harnessBundle")} description={plugin.compatibility.patchPath ?? t("settings.plugins.items.notDeclared")}><Tag color={plugin.compatibility.harnessBundle ? "processing" : "default"}>{plugin.compatibility.harnessBundle ? t("settings.plugins.yes") : t("settings.plugins.no")}</Tag></SettingsItem>
			<SettingsItem title={t("settings.plugins.items.harnessClient")} description={t("settings.plugins.items.harnessClientDescription")}><Tag color={plugin.compatibility.harnessClient ? "processing" : "default"}>{plugin.compatibility.harnessClient ? t("settings.plugins.yes") : t("settings.plugins.no")}</Tag></SettingsItem>
			<SettingsItem title={t("settings.plugins.items.entry")} description={plugin.compatibility.entryPaths.join(", ") || t("settings.plugins.items.notDeclared")}><Tag color="success">{t("settings.plugins.scanned")}</Tag></SettingsItem>
		</SettingsList>
		{plugin.compatibility.unsupportedFeatures.length > 0 ? <Alert type="warning" showIcon message={t("settings.plugins.unsupported")} description={<ul className={styles.warningList}>{plugin.compatibility.unsupportedFeatures.map((item): React.JSX.Element => <li key={item}>{item}</li>)}</ul>} /> : null}
		{plugin.compatibility.warnings.length > 0 ? <Alert type="info" showIcon message={t("settings.plugins.warnings")} description={<ul className={styles.warningList}>{plugin.compatibility.warnings.map((item): React.JSX.Element => <li key={item}>{item}</li>)}</ul>} /> : null}
		<SettingsList title={t("settings.plugins.runtime.logs")}><PluginLogList logs={logs} /></SettingsList>
		<Flex justify="space-between" align="center" className={styles.footerActions}><Typography.Text type="secondary" copyable={{ text: plugin.fingerprint }}>{t("settings.plugins.items.fingerprint")}: {plugin.fingerprint.slice(0, 12)}…</Typography.Text><Button danger icon={<Icon name="trash" />} loading={busy} onClick={(): void => onRemove(plugin)}>{t("settings.plugins.actions.remove")}</Button></Flex>
	</div>;
}
