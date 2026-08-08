export function shouldShowUpdateButton(state: AppUpdateState | null): boolean {
	if (state === null) {
		return false;
	}
	const hasKnownUpdate: boolean = state.updateKind !== null
		|| state.client.availableVersion !== null
		|| state.backend.availableVersion !== null;
	if (!hasKnownUpdate) {
		return false;
	}
	return state.status === "available"
		|| state.status === "downloading"
		|| state.status === "downloaded"
		|| state.status === "installing"
		|| state.status === "error";
}
