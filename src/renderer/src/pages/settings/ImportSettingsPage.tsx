import { Alert, App, Button, Typography } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { importSession, type ImportSessionResult } from "@/api/session-api";
import { Icon } from "@/assets/icons";
import styles from "./ImportSettingsPage.module.css";
import SettingsList from "@/components/SettingsList";
import SettingsItem from "@/components/SettingsItem";

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

function ImportSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const { message } = App.useApp();
	const [isImporting, setIsImporting] = useState<boolean>(false);
	const [importResult, setImportResult] = useState<ImportSessionResult | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const handleImportSession = async (): Promise<void> => {
		setErrorMessage(null);
		setImportResult(null);
		setIsImporting(true);
		try {
			const sourcePath: string | null = await window.electronAPI.sessionFs.pickImportSource({
				dialogTitle: t("settings.import.session.importSession.dialogTitle"),
				buttonLabel: t("settings.import.session.importSession.dialogButton")
			});
			if (sourcePath === null) {
				return;
			}
			const result: ImportSessionResult = await importSession(sourcePath);
			setImportResult(result);
			window.electronAPI.sessionCatalog.notifyChanged();
			void message.success(t(
				result.archived
					? "settings.import.session.importSession.successArchived"
					: "settings.import.session.importSession.success",
				{ title: result.title }
			));
		} catch (error: unknown) {
			const fallbackMessage: string = t("settings.import.errors.import");
			const nextErrorMessage: string = getErrorMessage(error, fallbackMessage);
			setErrorMessage(nextErrorMessage);
			void message.error(nextErrorMessage);
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<Typography.Title level={3} className={styles.title}>
						{t("settings.import.title")}
					</Typography.Title>
				</div>
			</header>

			<div className={styles.settingsStack}>
				<SettingsList title={t("settings.import.session.title")}>
					<SettingsItem
						title={t("settings.import.session.importSession.title")}
						description={t("settings.import.session.importSession.description")}
					>
						<Button
							type="primary"
							icon={<Icon name="download" />}
							loading={isImporting}
							onClick={() => { void handleImportSession(); }}
						>
							{t("settings.import.session.importSession.action")}
						</Button>
					</SettingsItem>
				</SettingsList>
			</div>
		</section>
	);
}

export default ImportSettingsPage;
