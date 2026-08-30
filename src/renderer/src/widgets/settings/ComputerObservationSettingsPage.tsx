import { Alert, Switch, Typography } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import SettingsList from "@/ui/SettingsList";
import SettingsItem from "@/ui/SettingsItem";
import ComputerObservationDiagnostics from "@/widgets/computer-observation/ComputerObservationDiagnostics";
import {
  useComputerDeveloperMode,
  useComputerState,
} from "@/features/computer-observation/useComputerState";
import styles from "./ComputerObservationSettingsPage.module.css";

export default function ComputerObservationSettingsPage({
  isActive,
}: {
  isActive: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const developer = useComputerDeveloperMode();
  const { api, state } = useComputerState();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  return (
    <section
      className={styles.page}
      data-testid="computer-observation-settings"
    >
      <header className={styles.header}>
        <Typography.Title level={3} className={styles.title}>
          {t("computer.title")}
        </Typography.Title>
      </header>
      <div className={styles.content}>
        <SettingsList title={t("computer.accessSettings")}>
          {api && (
            <>
              <SettingsItem
                searchKey="item:computer_observation.enabled"
                title={t("computer.setting")}
                description={t("computer.settingDescription")}
              >
                <Switch
                  aria-label={t("computer.setting")}
                  checked={state?.enabled ?? false}
                  loading={saving}
                  disabled={!state}
                  onChange={(checked) => {
                    setSaving(true);
                    setError(false);
                    void api
                      .setEnabled(checked)
                      .catch(() => setError(true))
                      .finally(() => setSaving(false));
                  }}
                />
              </SettingsItem>
              <SettingsItem
                searchKey="item:computer_observation.control"
                title={t("computer.controlSetting")}
                description={t(
                  state?.controlSupported
                    ? "computer.controlDescription"
                    : "computer.controlUnavailable",
                )}
              >
                <Switch
                  aria-label={t("computer.controlSetting")}
                  checked={state?.controlEnabled ?? false}
                  disabled={!state?.enabled || !state.controlSupported}
                  loading={saving}
                  onChange={(checked) => {
                    setSaving(true);
                    setError(false);
                    void api
                      .setControlEnabled(checked)
                      .catch(() => setError(true))
                      .finally(() => setSaving(false));
                  }}
                />
              </SettingsItem>
              {(error || state?.error) && (
                <Alert
                  type="warning"
                  title={
                    error
                      ? t("computer.saveFailed")
                      : t("computer.resourcesMissing")
                  }
                />
              )}
            </>
          )}
        </SettingsList>
        <SettingsList title={t("computer.diagnosticsTitle")}>
          {developer ? (
            isActive && <ComputerObservationDiagnostics />
          ) : (
            <Alert type="info" title={t("computer.developerRequired")} />
          )}
        </SettingsList>
      </div>
    </section>
  );
}
