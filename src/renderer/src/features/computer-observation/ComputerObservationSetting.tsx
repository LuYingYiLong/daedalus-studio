import { Alert, Switch } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import SettingsItem from "@/ui/SettingsItem";
import { useComputerState } from "./useComputerState";
export default function ComputerObservationSetting(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { api, state } = useComputerState();
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(false);
  if (!api) return null;
  return (
    <>
      <SettingsItem
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
      {(error || state?.error) && (
        <Alert
          type="warning"
          title={
            error ? t("computer.saveFailed") : t("computer.resourcesMissing")
          }
        />
      )}
    </>
  );
}
