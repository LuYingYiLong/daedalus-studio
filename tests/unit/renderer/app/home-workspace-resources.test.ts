import { describe, expect, it, vi } from "vitest";
import type {
	WorktreeEligibilityResult,
	WorktreeEligibilitySource,
} from "@/platform/rpc/workspace-api";
import { resolveWorktreeDisabledReason } from "@/features/workspace/controllers/useHomeWorkspaceResourcesController";

function createSource(
	overrides: Partial<WorktreeEligibilitySource> = {},
): WorktreeEligibilitySource {
	return {
		sourceFolderId: "source-1",
		sourcePath: "C:/workspace",
		eligible: false,
		repositoryRoot: null,
		commonDirectory: null,
		baseCommit: null,
		baseRef: null,
		dirty: false,
		reasonCode: null,
		reason: null,
		...overrides,
	};
}

function createResult(
	overrides: Partial<WorktreeEligibilityResult> = {},
): WorktreeEligibilityResult {
	return {
		workspaceId: "workspace-1",
		eligible: false,
		sources: [createSource()],
		...overrides,
	};
}

describe("home workspace resource helpers", () => {
	it("returns no disabled reason for an eligible workspace", () => {
		const getUnavailableMessage = vi.fn(() => "unavailable");

		expect(
			resolveWorktreeDisabledReason(
				createResult({ eligible: true }),
				getUnavailableMessage,
				vi.fn(),
			),
		).toBeNull();
		expect(getUnavailableMessage).not.toHaveBeenCalled();
	});

	it("translates a backend reason code while preserving the fallback", () => {
		const getReasonMessage = vi.fn(
			(reasonCode: string, fallback: string): string =>
				`${reasonCode}:${fallback}`,
		);

		const reason: string | null = resolveWorktreeDisabledReason(
			createResult({
				sources: [
					createSource({
						reasonCode: "dirty",
						reason: "working tree is dirty",
					}),
				],
			}),
			() => "unavailable",
			getReasonMessage,
		);

		expect(reason).toBe("dirty:working tree is dirty");
		expect(getReasonMessage).toHaveBeenCalledWith(
			"dirty",
			"working tree is dirty",
		);
	});

	it("uses the source reason or generic fallback when no code exists", () => {
		expect(
			resolveWorktreeDisabledReason(
				createResult({
					sources: [createSource({ reason: "not a repository" })],
				}),
				() => "unavailable",
				vi.fn(),
			),
		).toBe("not a repository");

		expect(
			resolveWorktreeDisabledReason(
				createResult({ sources: [] }),
				() => "unavailable",
				vi.fn(),
			),
		).toBe("unavailable");
	});
});
