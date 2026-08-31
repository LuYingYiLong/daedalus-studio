import { describe, expect, it } from "vitest";
import { waitForGlobalStyles, waitForRendererPaint, type AnimationFrameScheduler } from "@/app/composition/renderer-paint";

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

	it("waits until the global design tokens are applied", async () => {
		const callbacks: FrameRequestCallback[] = [];
		const scheduleFrame: AnimationFrameScheduler = (callback: FrameRequestCallback): number => {
			callbacks.push(callback);
			return callbacks.length;
		};
		const root = {} as HTMLElement;
		let stylesApplied: boolean = false;
		const documentRef = { documentElement: root } as Document;
		const originalGetComputedStyle = globalThis.getComputedStyle;
		globalThis.getComputedStyle = (() => ({
			getPropertyValue: (): string => stylesApplied ? "#141414" : ""
		})) as unknown as typeof getComputedStyle;

		try {
			let resolved: boolean = false;
			const ready = waitForGlobalStyles(documentRef, scheduleFrame).then((): void => {
				resolved = true;
			});
			expect(callbacks).toHaveLength(1);
			callbacks.shift()?.(0);
			expect(resolved).toBe(false);
			stylesApplied = true;
			callbacks.shift()?.(16);
			await ready;
			expect(resolved).toBe(true);
		} finally {
			globalThis.getComputedStyle = originalGetComputedStyle;
		}
	});
});
