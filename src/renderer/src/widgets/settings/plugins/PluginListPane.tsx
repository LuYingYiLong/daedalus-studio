import { Empty, Menu, Spin, Tag, Typography } from "antd";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import type { PluginCatalogResult } from "@/platform/rpc/plugin-api";
import { classificationColor } from "./plugin-formatters";
import styles from "./plugins.module.css";

export function PluginListPane({ catalog, loading, selectedId, onSelect }: { catalog: PluginCatalogResult | null; loading: boolean; selectedId: string | null; onSelect: (id: string) => void }): React.JSX.Element {
	const { t } = useTranslation();
	if (loading) return <div className={styles.center}><Spin /></div>;
	if (catalog === null || catalog.plugins.length === 0) return <Empty description={t("settings.plugins.empty")} />;
	const items: MenuProps["items"] = catalog.plugins.map((plugin) => ({
		key: plugin.id,
		label: <div className={styles.menuItem}><div className={styles.menuText}><Typography.Text strong ellipsis>{plugin.packageName}</Typography.Text><Typography.Text type="secondary" ellipsis>{plugin.version}</Typography.Text></div><Tag color={classificationColor(plugin.compatibility.classification)}>{t(`settings.plugins.classification.${plugin.compatibility.classification}`)}</Tag></div>
	}));
	return <Menu className={styles.menu} mode="inline" items={items} selectedKeys={selectedId === null ? [] : [selectedId]} onClick={({ key }): void => onSelect(key)} />;
}
