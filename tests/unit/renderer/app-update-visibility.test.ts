import { describe, expect, it } from "vitest";
import { shouldShowUpdateButton } from "@/domain/app-update/update-visibility";

function createComponentState(
	status: AppUpdateStatus,
	availableVersion: string | null = null
): AppUpdateComponentState {
	return {
		status,
		currentVersion: "1.0.7",
		availableVersion,
		releaseName: null,
		releaseDate: null,
		progress: null,
		errorMessage: status === "error" ? "network failed" : null,
		downloadPhase: null,
		downloadAttempt: null,
		downloadFallbackReason: null
	};
}

function createUpdateState(
	status: AppUpdateStatus,
	updateKind: AppUpdateKind = null,
	clientAvailableVersion: string | null = null,
	backendAvailableVersion: string | null = null
): AppUpdateState {
	return {
		status,
		updateKind,
		runtimeBusy: false,
		installDeferred: false,
		currentVersion: "1.0.7",
		availableVersion: clientAvailableVersion ?? backendAvailableVersion,
		releaseName: null,
		releaseDate: null,
		progress: null,
		errorMessage: status === "error" ? "network failed" : null,
		client: createComponentState(status === "error" ? "error" : "not_available", clientAvailableVersion),
		backend: createComponentState("not_available", backendAvailableVersion)
	};
}

describe("app update visibility", () => {
	it("does not present a startup check failure as an available update", () => {
		expect(shouldShowUpdateButton(createUpdateState("error"))).toBe(false);
	});

	it("keeps a failed known update visible so it can be retried", () => {
		expect(shouldShowUpdateButton(createUpdateState("error", "client", "1.0.8"))).toBe(true);
	});

	it("shows active client and backend updates", () => {
		expect(shouldShowUpdateButton(createUpdateState("available", "client", "1.0.8"))).toBe(true);
		expect(shouldShowUpdateButton(createUpdateState("available", "backend", null, "1.1.9"))).toBe(true);
	});
});
