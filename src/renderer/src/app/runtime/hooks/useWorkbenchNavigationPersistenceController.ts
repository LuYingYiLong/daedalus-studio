import { useCallback } from "react";
import type {
	WorkbenchPatch,
	WorkbenchPatchResult,
} from "@/platform/rpc/types";

export type WorkbenchNavigationPersistenceControllerParams = {
	takePendingWorkbenchPatch: () => WorkbenchPatch;
	sendWorkbenchPatch: (
		patch: WorkbenchPatch,
		applyResult?: boolean,
	) => Promise<WorkbenchPatchResult | null>;
};

export type WorkbenchNavigationPersistenceController = {
	persistPendingWorkbenchPatchBeforeNavigation: () => Promise<void>;
};

export default function useWorkbenchNavigationPersistenceController({
	takePendingWorkbenchPatch,
	sendWorkbenchPatch,
}: WorkbenchNavigationPersistenceControllerParams): WorkbenchNavigationPersistenceController {
	const persistPendingWorkbenchPatchBeforeNavigation = useCallback(
		async (): Promise<void> => {
			const pendingPatch: WorkbenchPatch = takePendingWorkbenchPatch();
			if (Object.keys(pendingPatch).length === 0) {
				return;
			}

			try {
				await sendWorkbenchPatch(pendingPatch, false);
			} catch (error: unknown) {
				console.warn(
					"[App] persist pending workbench patch before navigation failed",
					error,
				);
			}
		},
		[takePendingWorkbenchPatch, sendWorkbenchPatch],
	);

	return {
		persistPendingWorkbenchPatchBeforeNavigation,
	};
}
