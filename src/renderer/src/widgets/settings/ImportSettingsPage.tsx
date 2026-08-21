import { App, Button, Typography } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { importSession, type ImportSessionResult } from "@/platform/rpc/session-api";
import { fetchHarnessConfig, installPlugin, scanPlugin, updatePluginTrust, type PluginRecord, type PluginScanResult, type PluginSource } from "@/platform/rpc/plugin-api";
import { PluginTrustModal } from "./plugins/PluginTrustModal";
import SettingsList from "@/ui/SettingsList";
import SettingsItem from "@/ui/SettingsItem";
import { Icon } from "@/assets/icons";
import styles from "./import/import-settings.module.css";
import { HarnessPluginImportModal } from "./import/HarnessPluginImportModal";
import { PluginImportReviewModal } from "./import/PluginImportReviewModal";

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

function ImportSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const { message } = App.useApp();
	const [isImportingSession, setIsImportingSession] = useState<boolean>(false);
	const [isScanningPlugin, setIsScanningPlugin] = useState<boolean>(false);
	const [isInstallingPlugin, setIsInstallingPlugin] = useState<boolean>(false);
	const [isTrustingPlugin, setIsTrustingPlugin] = useState<boolean>(false);
	const [importResult, setImportResult] = useState<ImportSessionResult | null>(null);
	const [scanResult, setScanResult] = useState<PluginScanResult | null>(null);
	const [pluginSource, setPluginSource] = useState<PluginSource | null>(null);
	const [installedPlugin, setInstalledPlugin] = useState<PluginRecord | null>(null);
	const [pluginModalOpen, setPluginModalOpen] = useState<boolean>(false);
	const [reviewModalOpen, setReviewModalOpen] = useState<boolean>(false);
	const [trustModalOpen, setTrustModalOpen] = useState<boolean>(false);
	const [harnessTrustReady, setHarnessTrustReady] = useState<boolean>(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const handleImportSession = async (): Promise<void> => {
		setErrorMessage(null);
		setImportResult(null);
		setIsImportingSession(true);
		try {
			const sourcePath: string | null = await window.electronAPI.sessionFs.pickImportSource({
				dialogTitle: t("settings.import.session.importSession.dialogTitle"),
				buttonLabel: t("settings.import.session.importSession.dialogButton")
			});
			if (sourcePath === null) return;
			const result: ImportSessionResult = await importSession(sourcePath);
			setImportResult(result);
			window.electronAPI.sessionCatalog.notifyChanged();
			void message.success(t(result.archived ? "settings.import.session.importSession.successArchived" : "settings.import.session.importSession.success", { title: result.title }));
		} catch (error: unknown) {
			const nextErrorMessage: string = getErrorMessage(error, t("settings.import.errors.import"));
			setErrorMessage(nextErrorMessage);
			void message.error(nextErrorMessage);
		} finally {
			setIsImportingSession(false);
		}
	};

	const handleScanPlugin = async (source: PluginSource): Promise<void> => {
		setErrorMessage(null);
		setIsScanningPlugin(true);
		try {
			const result: PluginScanResult = await scanPlugin(source);
			setPluginSource(source);
			setScanResult(result);
			setPluginModalOpen(false);
			setReviewModalOpen(true);
		} catch (error: unknown) {
			const nextErrorMessage: string = getErrorMessage(error, t("settings.import.plugin.scanFailed"));
			setErrorMessage(nextErrorMessage);
			void message.error(nextErrorMessage);
		} finally {
			setIsScanningPlugin(false);
		}
	};

	const handleInstallPlugin = async (): Promise<void> => {
		if (pluginSource === null) return;
		setIsInstallingPlugin(true);
		try {
			const result = await installPlugin(pluginSource);
			setInstalledPlugin(result.plugin);
			setReviewModalOpen(false);
			setHarnessTrustReady(true);
			if (result.plugin.compatibility.harnessBundle) {
				try {
					const harness = await fetchHarnessConfig();
					setHarnessTrustReady(harness.installation.status === "detected");
				} catch {
					setHarnessTrustReady(false);
				}
			}
			setTrustModalOpen(true);
			void message.success(t("settings.plugins.messages.installed"));
		} catch (error: unknown) {
			const nextErrorMessage: string = getErrorMessage(error, t("settings.plugins.errors.install"));
			setErrorMessage(nextErrorMessage);
			void message.error(nextErrorMessage);
		} finally {
			setIsInstallingPlugin(false);
		}
	};

	const handleTrustPlugin = async (): Promise<void> => {
		if (installedPlugin === null) return;
		setIsTrustingPlugin(true);
		try {
			await updatePluginTrust(installedPlugin.id, installedPlugin.fingerprint, "trusted");
			setTrustModalOpen(false);
			void message.success(t("settings.plugins.messages.trusted"));
		} catch (error: unknown) {
			const nextErrorMessage: string = getErrorMessage(error, t("settings.plugins.errors.trust"));
			setErrorMessage(nextErrorMessage);
			void message.error(nextErrorMessage);
		} finally {
			setIsTrustingPlugin(false);
		}
	};

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<Typography.Title level={3} className={styles.title}>{t("settings.import.title")}</Typography.Title>
			</header>
			<div className={styles.settingsStack}>
				{errorMessage !== null ? <div role="alert" className={styles.error}>{errorMessage}</div> : null}
				<SettingsList title={t("settings.import.session.title")}>
					<SettingsItem
						title={t("settings.import.session.importSession.title")}
						description={t("settings.import.session.importSession.description")}
					>
						<Button type="primary" icon={<Icon name="download" />} loading={isImportingSession} onClick={(): void => { void handleImportSession(); }}>
							{t("settings.import.session.importSession.action")}
						</Button>
					</SettingsItem>
				</SettingsList>
				<SettingsList title={t("settings.import.plugin.sectionTitle")}>
					<SettingsItem
						title={t("settings.import.plugin.title")}
						description={t("settings.import.plugin.description")}
					>
						<Button type="primary" icon={<Icon name="plugin" />} onClick={(): void => setPluginModalOpen(true)}>
							{t("settings.import.plugin.action")}
						</Button>
					</SettingsItem>
				</SettingsList>
				{importResult !== null ? <Typography.Text type="secondary">{t("settings.import.session.importSession.resultDescription_other", { sessionId: importResult.sessionId, files: importResult.restoredFileCount })}</Typography.Text> : null}
			</div>
			<HarnessPluginImportModal open={pluginModalOpen} loading={isScanningPlugin} onCancel={(): void => setPluginModalOpen(false)} onScan={handleScanPlugin} />
			<PluginImportReviewModal open={reviewModalOpen} loading={isInstallingPlugin} scan={scanResult} source={pluginSource} onCancel={(): void => setReviewModalOpen(false)} onInstall={handleInstallPlugin} />
			<PluginTrustModal
				open={trustModalOpen}
				plugin={installedPlugin ?? undefined}
				loading={isTrustingPlugin}
				confirmDisabled={Boolean(installedPlugin?.compatibility.harnessBundle) && !harnessTrustReady}
				confirmDisabledReason={Boolean(installedPlugin?.compatibility.harnessBundle) && !harnessTrustReady ? t("settings.import.plugin.harnessRuntimeRequired") : undefined}
				onConfigureHarness={(): void => { void window.electronAPI.windowControl.openSettings("environments"); }}
				onCancel={(): void => setTrustModalOpen(false)}
				onConfirm={(): void => { void handleTrustPlugin(); }}
			/>
		</section>
	);
}

export default ImportSettingsPage;
