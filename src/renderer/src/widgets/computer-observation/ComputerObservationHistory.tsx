import { Alert, Button, Spin, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { useComputerObservationHistory } from "@/features/computer-observation/useComputerObservationHistory";
import { ComputerObservationEvidence } from "./ComputerObservationEvidence";

export default function ComputerObservationHistory({
  sessionId,
  observationId,
}: {
  sessionId: string;
  observationId: string;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const {
    available,
    developer,
    requested,
    state,
    observation,
    request,
  } = useComputerObservationHistory(sessionId, observationId);
  if (!available) return null;
  if (!developer) return <Alert type="info" title={t("trajectory.hidden")} />;
  if (!requested)
    return (
      <Button onClick={request}>
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
