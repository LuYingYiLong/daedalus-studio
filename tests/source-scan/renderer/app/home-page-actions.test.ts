import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Home page action adapter source", () => {
	const appSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"useAppController.tsx",
	);
	const adapterSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"home-page-actions.ts",
	);
	const workspaceSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"home-page-workspace-actions.ts",
	);
	const composerSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"home-page-composer-actions.ts",
	);
	const draftSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"home-page-draft-actions.ts",
	);
	const timelineSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"home-page-timeline-actions.ts",
	);
	const navigationSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"home-page-navigation-actions.ts",
	);
	const settingsSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"home-page-settings-actions.ts",
	);

	it("keeps HomePage event adaptation outside the app controller", () => {
		expect(appSource).toContain("createHomePageActions({");
		expect(appSource).not.toContain("onHomeExecutionEnvironmentChange:");
		expect(appSource).not.toContain("onQueueMessageRemove:");
		expect(workspaceSource).toContain("onHomeExecutionEnvironmentChange:");
		expect(workspaceSource).toContain("onAddContext:");
		expect(composerSource).toContain("onQueueMessageRemove:");
		expect(draftSource).toContain("onRetryEditStart:");
	});

	it("keeps direct handler wrapping outside the app controller", () => {
		expect(appSource).toContain("createHomePageDirectActionHandlers({");
		expect(appSource).not.toContain("onPlanClarificationSkip:");
		expect(appSource).not.toContain("onWorkflowTodoDismiss:");
		expect(appSource).toContain("timeline: {");
		expect(appSource).toContain("navigation: {");
		expect(appSource).toContain("settings: {");
		expect(adapterSource).toContain(
			"export function createHomePageDirectActionHandlers({",
		);
		expect(adapterSource).toContain("createHomePageTimelineActions(timeline)");
		expect(adapterSource).toContain("createHomePageNavigationActions(navigation)");
		expect(adapterSource).toContain("createHomePageSettingsActions(settings)");
		expect(timelineSource).toContain("onPlanClarificationSkip:");
		expect(timelineSource).toContain("onWorkflowTodoDismiss:");
		expect(navigationSource).toContain("onSessionSelect:");
		expect(settingsSource).toContain("onApprovalModeChange:");
	});
});
