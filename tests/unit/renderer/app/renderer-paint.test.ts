import { describe, expect, it } from "vitest";
import { waitForRendererPaint, type AnimationFrameScheduler } from "@/app/runtime/renderer-paint";

describe("renderer paint readiness", () => {
	it("waits for two animation frames before resolving", async () => {
		const callbacks: FrameRequestCallback[] = [];
		const scheduleFrame: AnimationFrameScheduler = (callback: FrameRequestCallback): number => {
			callbacks.push(callback);
			return callbacks.length;
		};
		let resolved: boolean = false;
		const ready = waitForRendererPaint(scheduleFrame).then((): void => {
			resolved = true;
		});

		expect(callbacks).toHaveLength(1);
		callbacks.shift()?.(0);
		expect(callbacks).toHaveLength(1);
		expect(resolved).toBe(false);
		callbacks.shift()?.(16);
		await ready;
		expect(resolved).toBe(true);
	});
});
