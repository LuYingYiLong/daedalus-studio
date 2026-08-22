import { Alert, App, Button, Tooltip, Typography } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import {
	fetchPluginCatalog,
	fetchPluginRuntimeLogs,
	fetchPluginVersions,
	previewHarnessBundle,
	installPlugin,
	installPluginDependencies,
	removePlugin,
	restartPluginRuntime,
	rollbackPlugin,
	clearPluginRuntimeQuarantine,
	updatePlugin,
	updatePluginProfile,
	updatePluginTrust,
	type PluginCatalogResult,
	type PluginRecord,
	type PluginRuntimeLog,
	type PluginSource,
	type HarnessBundleSummary,
} from "@/platform/rpc/plugin-api";
import { PluginListPane } from "./plugins/PluginListPane";
import { PluginDetailPane } from "./plugins/PluginDetailPane";
import { PluginInstallModal } from "./plugins/PluginInstallModal";
import { PluginTrustModal } from "./plugins/PluginTrustModal";
import { HarnessBundlePreview } from "./plugins/HarnessBundlePreview";
import styles from "./plugins/plugins.module.css";

function PluginsSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const { message, modal } = App.useApp();
	const [catalog, setCatalog] = useState<PluginCatalogResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [installOpen, setInstallOpen] = useState(false);
	const [updateTarget, setUpdateTarget] = useState<PluginRecord | null>(null);
	const [installing, setInstalling] = useState(false);
	const [busyPluginId, setBusyPluginId] = useState<string | null>(null);
	const [trustCandidate, setTrustCandidate] = useState<
		PluginRecord | undefined
	>();
	const [trustMode, setTrustMode] = useState<"trusted" | "disabled">("trusted");
	const [logs, setLogs] = useState<PluginRuntimeLog[]>([]);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [previewSummary, setPreviewSummary] = useState<HarnessBundleSummary | null>(null);
	const selectedPlugin = catalog?.plugins.find(
		(plugin): boolean => plugin.id === selectedId,
	);

	async function refresh(): Promise<void> {
		try {
			setError(null);
			const next = await fetchPluginCatalog();
			setCatalog(next);
			setSelectedId((current): string | null =>
				current !== null &&
				next.plugins.some((plugin): boolean => plugin.id === current)
					? current
					: (next.plugins[0]?.id ?? null),
			);
		} catch (caught: unknown) {
			setError(
				caught instanceof Error
					? caught.message
					: t("settings.plugins.errors.load"),
			);
		} finally {
			setLoading(false);
		}
	}
	useEffect((): void => {
		void refresh();
	}, []);
	useEffect((): void => {
		if (selectedId !== null)
			void fetchPluginRuntimeLogs(selectedId)
				.then(setLogs)
				.catch((): void => setLogs([]));
		else setLogs([]);
	}, [selectedId, catalog]);

	async function handleInstall(source: PluginSource): Promise<void> {
		try {
			setInstalling(true);
			const result = updateTarget === null ? await installPlugin(source) : { plugin: await updatePlugin(updateTarget.id, source, updateTarget.fingerprint), catalog: await fetchPluginCatalog() };
			setCatalog(result.catalog);
			setSelectedId(result.plugin.id);
			setInstallOpen(false);
			setUpdateTarget(null);
			if (result.plugin.trust === "review_required") {
				setTrustMode("trusted");
				setTrustCandidate(result.plugin);
			}
		} catch (caught: unknown) {
			message.error(
				caught instanceof Error
					? caught.message
					: t("settings.plugins.errors.install"),
			);
		} finally {
			setInstalling(false);
		}
	}
	function openUpdate(plugin: PluginRecord): void {
		setUpdateTarget(plugin);
		setInstallOpen(true);
	}
	async function toggle(plugin: PluginRecord): Promise<void> {
		if (catalog === null || plugin.trust !== "trusted") return;
		try {
			setBusyPluginId(plugin.id);
			const ids = catalog.activeProfile.pluginIds.includes(plugin.id)
				? catalog.activeProfile.pluginIds.filter(
						(id): boolean => id !== plugin.id,
					)
				: [...catalog.activeProfile.pluginIds, plugin.id];
			setCatalog(await updatePluginProfile(ids));
		} catch (caught: unknown) {
			message.error(
				caught instanceof Error
					? caught.message
					: t("settings.plugins.errors.profile"),
			);
		} finally {
			setBusyPluginId(null);
		}
	}
	async function trust(
		plugin: PluginRecord,
		status: "trusted" | "disabled",
	): Promise<boolean> {
		try {
			setBusyPluginId(plugin.id);
			await updatePluginTrust(plugin.id, plugin.fingerprint, status);
			const next = await fetchPluginCatalog();
			setCatalog(next);
			return true;
		} catch (caught: unknown) {
			message.error(
				caught instanceof Error
					? caught.message
					: t("settings.plugins.errors.trust"),
			);
			return false;
		} finally {
			setBusyPluginId(null);
		}
	}
	function requestTrust(plugin: PluginRecord, status: "trusted" | "disabled"): void {
		setTrustMode(status);
		setTrustCandidate(plugin);
	}
	function remove(plugin: PluginRecord): void {
		modal.confirm({
			title: t("settings.plugins.confirm.removeTitle"),
			content: t("settings.plugins.confirm.removeDescription", {
				name: plugin.packageName,
			}),
			okButtonProps: { danger: true },
			onOk: async (): Promise<void> => {
				try {
					setBusyPluginId(plugin.id);
					setCatalog(await removePlugin(plugin.id));
					setSelectedId(null);
					message.success(t("settings.plugins.messages.removed"));
				} catch (caught: unknown) {
					message.error(
						caught instanceof Error
							? caught.message
							: t("settings.plugins.errors.remove"),
					);
				} finally {
					setBusyPluginId(null);
				}
			},
		});
	}
	async function restart(): Promise<void> {
		if (selectedPlugin === undefined) return;
		try {
			setBusyPluginId(selectedPlugin.id);
			await restartPluginRuntime(selectedPlugin.id);
			await refresh();
		} catch (caught: unknown) {
			message.error(
				caught instanceof Error
					? caught.message
					: t("settings.plugins.runtime.error"),
			);
		} finally {
			setBusyPluginId(null);
		}
	}
	async function clearQuarantine(): Promise<void> {
		if (selectedPlugin === undefined) return;
		try {
			setBusyPluginId(selectedPlugin.id);
			await clearPluginRuntimeQuarantine(selectedPlugin.id);
			await refresh();
			message.success(t("settings.plugins.runtime.quarantineCleared"));
		} catch (caught: unknown) {
			message.error(caught instanceof Error ? caught.message : t("settings.plugins.errors.runtime"));
		} finally { setBusyPluginId(null); }
	}
	async function rollback(): Promise<void> {
		if (selectedPlugin === undefined) return;
		try {
			const versions = await fetchPluginVersions(selectedPlugin.id);
			const version = versions[0];
			if (version === undefined) { message.info(t("settings.plugins.runtime.versionsEmpty")); return; }
			modal.confirm({
				title: t("settings.plugins.actions.rollback"),
				content: t("settings.plugins.runtime.rollbackConfirm", { version: version.version }),
				onOk: async (): Promise<void> => {
					try {
						setBusyPluginId(selectedPlugin.id);
						await rollbackPlugin(selectedPlugin.id, version.fingerprint);
						await refresh();
					} catch (caught: unknown) { message.error(caught instanceof Error ? caught.message : t("settings.plugins.errors.runtime")); }
					finally { setBusyPluginId(null); }
				},
			});
		} catch (caught: unknown) { message.error(caught instanceof Error ? caught.message : t("settings.plugins.errors.runtime")); }
	}
	function dependencies(): void {
		if (selectedPlugin === undefined) return;
		const plugin = selectedPlugin;
		modal.confirm({
			title: t("settings.plugins.runtime.networkTitle"),
			content: t("settings.plugins.runtime.networkDescription", {
				name: plugin.packageName,
			}),
			okText: t("settings.plugins.runtime.allowNetwork"),
			onOk: async (): Promise<void> => {
				try {
					setBusyPluginId(plugin.id);
					await installPluginDependencies(plugin.id, true);
					await refresh();
				} catch (caught: unknown) {
					message.error(
						caught instanceof Error
							? caught.message
							: t("settings.plugins.runtime.error"),
					);
				} finally {
					setBusyPluginId(null);
				}
			},
		});
	}
	async function openHarnessPreview(): Promise<void> {
		if (selectedPlugin === undefined) return;
		setPreviewOpen(true);
		setPreviewSummary(null);
		try { setPreviewLoading(true); setPreviewSummary(await previewHarnessBundle(selectedPlugin.id)); }
		catch (caught: unknown) { message.error(caught instanceof Error ? caught.message : t("settings.plugins.harness.previewFailed")); }
		finally { setPreviewLoading(false); }
	}

	return (
		<section className={styles.page}>
			<aside className={styles.listPane}>
				<PluginListPane
					catalog={catalog}
					loading={loading}
					selectedId={selectedId}
					onSelect={setSelectedId}
					onAdd={(): void => setInstallOpen(true)}
				/>
			</aside>
			<section className={styles.detailPane}>
				{error !== null ? (
					<Alert
						type="error"
						showIcon
						className={styles.alert}
						title={error}
					/>
				) : null}
				<div className={styles.detailScroll}>
					<PluginDetailPane
						plugin={selectedPlugin}
						busy={busyPluginId === selectedPlugin?.id}
						onToggle={(plugin): void => {
							void toggle(plugin);
						}}
						onRequestTrust={requestTrust}
						onRemove={remove}
							onRestart={(): void => {
							void restart();
						}}
						onUpdate={(): void => { if (selectedPlugin !== undefined) openUpdate(selectedPlugin); }}
						onClearQuarantine={(): void => { void clearQuarantine(); }}
						onRollback={(): void => { void rollback(); }}
						onInstallDependencies={(): void => {
							void dependencies();
						}}
						onPreviewHarness={(): void => { void openHarnessPreview(); }}
						logs={logs}
					/>
				</div>
			</section>
			<PluginInstallModal
				open={installOpen}
				loading={installing}
		onCancel={(): void => { setInstallOpen(false); setUpdateTarget(null); }}
				onSubmit={handleInstall}
				title={updateTarget === null ? undefined : t("settings.plugins.actions.update")}
				submitLabel={updateTarget === null ? undefined : t("settings.plugins.actions.update")}
			/>
			<PluginTrustModal
				plugin={trustCandidate}
				open={trustCandidate !== undefined}
				mode={trustMode}
				loading={
					trustCandidate !== undefined &&
					busyPluginId === trustCandidate.id
				}
				onCancel={(): void => setTrustCandidate(undefined)}
				onConfirm={(): void => {
					if (trustCandidate !== undefined) {
						void trust(trustCandidate, trustMode).then((success): void => {
							if (success) setTrustCandidate(undefined);
						});
					}
				}}
			/>
			<HarnessBundlePreview
				plugin={selectedPlugin}
				summary={previewSummary}
				open={previewOpen}
				loading={previewLoading}
				onClose={(): void => setPreviewOpen(false)}
			/>
		</section>
	);
}

export default PluginsSettingsPage;
