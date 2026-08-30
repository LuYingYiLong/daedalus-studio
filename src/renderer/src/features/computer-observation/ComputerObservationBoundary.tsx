import { Alert, Button } from "antd";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { bindComputerRuntime } from "./computer-runtime";
import { useComputerState } from "./useComputerState";
import ComputerWindowPicker from "./ComputerWindowPicker";
export default function ComputerObservationBoundary({
  sessionId,
  workspaceId,
}: {
  sessionId: string | null;
  workspaceId: string | null;
}): React.JSX.Element | null {
  const { api, state } = useComputerState();
  useEffect(
    () => bindComputerRuntime(sessionId, workspaceId),
    [sessionId, workspaceId],
  );
  const load = useCallback(() => api!.list(), [api]);
  if (!api) return null;
  return (
    <ComputerWindowPicker
      open={!!state?.pending}
      reason={state?.pending?.reason}
      load={load}
      close={() => {
        void api.revoke();
      }}
      choose={async (sourceId) => {
        if (state?.pending)
          await api.decide({ callId: state.pending.callId, sourceId });
      }}
    />
  );
}
export function ComputerSharingIndicator(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { api, state } = useComputerState();
  if (!state?.sharing || !api) return null;
  return (
    <Alert
      type="info"
      title={t("computer.sharing", { title: state.sharing.title })}
      action={
        <Button size="small" onClick={() => void api.revoke()}>
          {t("computer.stop")}
        </Button>
      }
    />
  );
}
