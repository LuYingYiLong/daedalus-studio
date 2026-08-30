import { Alert, Button, Flex } from "antd";
import { useTranslation } from "react-i18next";
import SettingsItem from "@/ui/SettingsItem";
import { useComputerObservationDiagnostics } from "@/features/computer-observation/useComputerObservationDiagnostics";
import { ComputerObservationEvidence } from "./ComputerObservationEvidence";
import ComputerWindowPicker from "./ComputerWindowPicker";

// 仅设置页挂载；诊断结果只保留到离开该页，不混入会话的 AI 观察
export default function ComputerObservationDiagnostics(): React.JSX.Element | null {
	const { t } = useTranslation();
	const { api, state, open, openPicker, observation, load, close, choose } =
		useComputerObservationDiagnostics();
	if (!api) return null;
	return (
		<Flex
			vertical
			gap="small"
			data-testid="computer-observation-diagnostics"
		>
			<SettingsItem
				title={t("computer.diagnose")}
				description={t("computer.localOnly")}
				searchKey="item:computer_observation.diagnostics"
			>
				<Button
					onClick={openPicker}
					disabled={!state?.available || state.diagnosticsBlocked}
				>
					{t("computer.diagnose")}
				</Button>
			</SettingsItem>
			{state?.diagnosticsBlocked && (
				<Alert type="info" title={t("computer.diagnosticsBusy")} />
			)}

			<ComputerWindowPicker
				open={open}
				load={load}
				close={close}
				choose={choose}
			>
				{observation && (
					<ComputerObservationEvidence
						key={observation.observationId}
						observation={observation}
					/>
				)}
			</ComputerWindowPicker>
		</Flex>
	);
}
