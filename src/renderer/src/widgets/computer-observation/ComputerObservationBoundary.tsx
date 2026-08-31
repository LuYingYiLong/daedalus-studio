import { useCallback } from "react";
import { useComputerState } from "@/features/computer-observation/useComputerState";
import { useComputerObservationSession } from "@/features/computer-observation/useComputerObservationSession";
import ComputerWindowPicker from "./ComputerWindowPicker";
export default function ComputerObservationBoundary({
	sessionId,
	workspaceId,
}: {
	sessionId: string | null;
	workspaceId: string | null;
}): React.JSX.Element | null {
	const { api, state } = useComputerState();
	useComputerObservationSession(sessionId, workspaceId);
	const load = useCallback(() => api!.list(), [api]);
	if (!api) return null;
	return (
		<ComputerWindowPicker
			open={!!state?.pending}
			reason={state?.pending?.reason}
			control={state?.pending?.mode === "control"}
			autoApproved={state?.pending?.approvalMode === "full-trust"}
			load={load}
			close={() => {
				void api.revoke();
			}}
			choose={async (sourceId) => {
				if (state?.pending)
					await api.decide({
						callId: state.pending.callId,
						sourceId,
					});
			}}
		/>
	);
}
