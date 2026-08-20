import { Button, Empty, Input, Menu, Spin, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import type { PluginCatalogResult, PluginRecord } from "@/platform/rpc/plugin-api";
import { Icon } from "@/assets/icons";
import { classificationColor } from "./plugin-formatters";
import styles from "./plugins.module.css";

export function PluginListPane({ catalog, loading, selectedId, onSelect, onAdd }: { catalog: PluginCatalogResult | null; loading: boolean; selectedId: string | null; onSelect: (id: string) => void; onAdd: () => void }): React.JSX.Element {
	const { t } = useTranslation();
	const [query, setQuery] = useState("");
	const plugins = useMemo((): PluginRecord[] => {
		if (catalog === null) return [];
		const normalized = query.trim().toLowerCase();
		return normalized.length === 0 ? catalog.plugins : catalog.plugins.filter((plugin): boolean => `${plugin.packageName} ${plugin.version} ${plugin.source.type}`.toLowerCase().includes(normalized));
	}, [catalog, query]);
	const items: MenuProps["items"] = plugins.map((plugin) => ({
		key: plugin.id,
		label: <div className={styles.menuItem}><div className={styles.menuText}><Typography.Text strong ellipsis>{plugin.packageName}</Typography.Text><Typography.Text type="secondary" ellipsis>{plugin.version} · {plugin.source.type}</Typography.Text></div><Tag color={classificationColor(plugin.compatibility.classification)}>{t(`settings.plugins.classification.${plugin.compatibility.classification}`)}</Tag></div>
	}));
	return <div className={styles.listContent}>
		<Input prefix={<Icon name="search" />} allowClear placeholder={t("settings.plugins.searchPlaceholder")} value={query} onChange={(event): void => setQuery(event.target.value)} />
		{loading ? <div className={styles.center}><Spin /></div> : plugins.length === 0 ? <div className={styles.emptyList}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={catalog === null || catalog.plugins.length === 0 ? t("settings.plugins.empty") : t("settings.plugins.noMatches")} /></div> : <Menu className={`${styles.menu} daedalus-compact-menu`} mode="inline" inlineIndent={8} items={items} selectedKeys={selectedId === null ? [] : [selectedId]} onClick={({ key }): void => onSelect(String(key))} />}
		<Button className={styles.addButton} icon={<Icon name="add" />} onClick={onAdd}>{t("settings.plugins.actions.add")}</Button>
	</div>;
}
