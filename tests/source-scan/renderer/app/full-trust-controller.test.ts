import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("full trust controller source", () => {
	const controllerSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useFullTrustConfirmationController.ts",
	);
	const appSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"useAppController.tsx",
	);

	it("keeps confirmation state and save orchestration outside the app controller", () => {
		expect(controllerSource).toContain("saveApprovalMode");
		expect(controllerSource).toContain('"full-trust"');
		expect(appSource).not.toContain("async function handleFullTrustConfirm");
		expect(appSource).toContain("useFullTrustConfirmationController");
	});
});
