import { Alert, Button, Spin, Typography } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import { getPlatformRuntime } from "@/platform/runtime/platform-runtime";
import {
  parseComputerObservation,
  type ComputerObservation,
} from "../../../../contracts/computer-observation";
import { ComputerObservationEvidence } from "./ComputerObservationPanel";
import { useComputerDeveloperMode } from "./useComputerState";

export default function ComputerObservationHistory({
  sessionId,
  observationId,
}: {
  sessionId: string;
  observationId: string;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const [requested, setRequested] = useState(false),
    [state, setState] = useState<
      "idle" | "loading" | "full" | "compacted" | "summary" | "error"
    >("idle");
  const [observation, setObservation] = useState<ComputerObservation | null>(
    null,
  );
  const available = !!getPlatformRuntime().system?.computerObservation;
  const developer = useComputerDeveloperMode();
  useEffect(() => {
    if (!developer) {
      setObservation(null);
      setState("summary");
      return;
    }
    if (!available || !requested) return;
    let active = true;
    setState("loading");
    setObservation(null);
    void createBackendClient()
      .then((client) =>
        client.request<{
          detailLevel: "full" | "summary" | "compacted";
          observation?: unknown;
          dataUrl?: string;
        }>("session.computerObservation.get", { sessionId, observationId }),
      )
      .then((value) => {
        if (!active) return;
        if (value.detailLevel === "full")
          setObservation(
            parseComputerObservation({
              ...(value.observation as object),
              ...(value.dataUrl ? { dataUrl: value.dataUrl } : {}),
            }),
          );
        setState(value.detailLevel);
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [available, developer, requested, sessionId, observationId]);
  if (!available) return null;
  if (!developer) return <Alert type="info" title={t("trajectory.hidden")} />;
  if (!requested)
    return (
      <Button onClick={() => setRequested(true)}>
        {t("computer.viewEvidence")}
      </Button>
    );
  if (state === "loading") return <Spin />;
  if (state === "full" && observation)
    return (
      <>
        <Typography.Text copyable>{observationId}</Typography.Text>
        <ComputerObservationEvidence
          key={observationId}
          observation={observation}
        />
      </>
    );
  if (state === "idle") return null;
  return (
    <Alert
      type="info"
      title={t(
        state === "compacted"
          ? "trajectory.compacted"
          : state === "summary"
            ? "trajectory.hidden"
            : "computer.failed",
      )}
    />
  );
}
