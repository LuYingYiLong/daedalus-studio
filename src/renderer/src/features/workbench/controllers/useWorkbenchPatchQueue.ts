import { useCallback, useEffect, useRef } from "react";
import { patchWorkbench } from "@/platform/rpc/workbench-api";
import type { WorkbenchPatch, WorkbenchPatchResult, WorkbenchSnapshot } from "@/platform/rpc/types";

const WORKBENCH_PATCH_DEBOUNCE_MS = 220;

export function mergeWorkbenchPatch(left: WorkbenchPatch, right: WorkbenchPatch): WorkbenchPatch {
	return {
		...left,
		...right,
		composer: {
			...left.composer,
			...right.composer
		}
	};
}

export type WorkbenchPatchQueueController = {
	takePendingWorkbenchPatch: () => WorkbenchPatch;
	sendWorkbenchPatch: (patch: WorkbenchPatch, applyResult?: boolean, beforeSend?: () => void) => Promise<WorkbenchPatchResult | null>;
	sendPendingWorkbenchPatch: () => Promise<void>;
	queueWorkbenchPatch: (patch: WorkbenchPatch, immediate?: boolean) => void;
};

function useWorkbenchPatchQueue(applyWorkbench: (nextWorkbench: WorkbenchSnapshot) => void): WorkbenchPatchQueueController {
	const pendingPatchRef = useRef<WorkbenchPatch>({});
	const patchTimerRef = useRef<number | null>(null);
	const patchSequenceRef = useRef<number>(0);

	const takePendingWorkbenchPatch = useCallback((): WorkbenchPatch => {
		if (patchTimerRef.current !== null) {
			window.clearTimeout(patchTimerRef.current);
			patchTimerRef.current = null;
		}

		const pendingPatch: WorkbenchPatch = pendingPatchRef.current;
		pendingPatchRef.current = {};

		return pendingPatch;
	}, []);

	const sendWorkbenchPatch = useCallback(async (patch: WorkbenchPatch, applyResult: boolean = true, beforeSend?: () => void): Promise<WorkbenchPatchResult | null> => {
		if (Object.keys(patch).length === 0) {
			return null;
		}

		const result = await patchWorkbench({
			...patch,
			clientSequence: patchSequenceRef.current += 1
		}, beforeSend);

		if (applyResult) {
			applyWorkbench(result.workbench);
		}

		return result;
	}, [applyWorkbench]);

	const sendPendingWorkbenchPatch = useCallback(async (): Promise<void> => {
		await sendWorkbenchPatch(takePendingWorkbenchPatch());
	}, [sendWorkbenchPatch, takePendingWorkbenchPatch]);

	const queueWorkbenchPatch = useCallback((patch: WorkbenchPatch, immediate: boolean = false): void => {
		pendingPatchRef.current = mergeWorkbenchPatch(pendingPatchRef.current, patch);

		if (immediate) {
			void sendPendingWorkbenchPatch().catch((error: unknown): void => {
				console.error("[App] workbench patch failed", error);
			});
			return;
		}

		if (patchTimerRef.current !== null) {
			window.clearTimeout(patchTimerRef.current);
		}

		patchTimerRef.current = window.setTimeout((): void => {
			void sendPendingWorkbenchPatch().catch((error: unknown): void => {
				console.error("[App] workbench patch failed", error);
			});
		}, WORKBENCH_PATCH_DEBOUNCE_MS);
	}, [sendPendingWorkbenchPatch]);

	useEffect((): (() => void) => {
		return (): void => {
			if (patchTimerRef.current !== null) {
				window.clearTimeout(patchTimerRef.current);
				patchTimerRef.current = null;
			}
		};
	}, []);

	return {
		takePendingWorkbenchPatch,
		sendWorkbenchPatch,
		sendPendingWorkbenchPatch,
		queueWorkbenchPatch
	};
}

export default useWorkbenchPatchQueue;
