import { describe, expect, it } from "vitest";
import {
	createTimelineScrollFrameCoordinator,
	type TimelineScrollFrameScheduler
} from "@/domain/conversation/timeline-scroll-frame";

function createFrameScheduler(): {
	scheduler: TimelineScrollFrameScheduler;
	flush: () => void;
	getPendingCount: () => number;
} {
	let nextHandle: number = 1;
	const callbacks: Map<number, FrameRequestCallback> = new Map();
	return {
		scheduler: {
			requestFrame: (callback: FrameRequestCallback): number => {
				const handle: number = nextHandle;
				nextHandle += 1;
				callbacks.set(handle, callback);
				return handle;
			},
			cancelFrame: (handle: number): void => {
				callbacks.delete(handle);
			}
		},
		flush: (): void => {
			const callbacksToRun: FrameRequestCallback[] = [...callbacks.values()];
			callbacks.clear();
			for (const callback of callbacksToRun) {
				callback(0);
			}
		},
		getPendingCount: (): number => callbacks.size
	};
}

describe("timeline scroll frame coordinator", () => {
	it("coalesces repeated schedules and runs subscribers in the fixed layout order", () => {
		const frames = createFrameScheduler();
		const coordinator = createTimelineScrollFrameCoordinator(frames.scheduler);
		const calls: string[] = [];
		coordinator.subscribe("selection_overlay", (): void => { calls.push("selection"); });
		coordinator.subscribe("sticky_code_header", (): void => { calls.push("sticky"); });
		coordinator.subscribe("bottom_state", (): void => { calls.push("bottom"); });
		coordinator.subscribe("active_block", (): void => { calls.push("active"); });

		coordinator.schedule();
		coordinator.schedule();
		coordinator.schedule();

		expect(frames.getPendingCount()).toBe(1);
		frames.flush();
		expect(calls).toEqual(["active", "bottom", "sticky", "selection"]);

		coordinator.schedule();
		expect(frames.getPendingCount()).toBe(1);
	});

	it("does not run a queued frame after disposal", () => {
		const frames = createFrameScheduler();
		const coordinator = createTimelineScrollFrameCoordinator(frames.scheduler);
		let callCount: number = 0;
		coordinator.subscribe("active_block", (): void => { callCount += 1; });
		coordinator.schedule();
		coordinator.dispose();

		frames.flush();
		expect(callCount).toBe(0);
		expect(frames.getPendingCount()).toBe(0);
	});

	it("stops calling a subscriber as soon as its owner unsubscribes", () => {
		const frames = createFrameScheduler();
		const coordinator = createTimelineScrollFrameCoordinator(frames.scheduler);
		let callCount: number = 0;
		const unsubscribe = coordinator.subscribe("sticky_code_header", (): void => { callCount += 1; });
		coordinator.schedule();
		unsubscribe();

		frames.flush();
		expect(callCount).toBe(0);
	});

	it("can be reused after an effect cleanup cancels its current frame", () => {
		const frames = createFrameScheduler();
		const coordinator = createTimelineScrollFrameCoordinator(frames.scheduler);
		let callCount: number = 0;
		coordinator.subscribe("active_block", (): void => { callCount += 1; });
		coordinator.schedule();
		coordinator.cancel();
		frames.flush();
		expect(callCount).toBe(0);

		coordinator.schedule();
		frames.flush();
		expect(callCount).toBe(1);
	});
});
