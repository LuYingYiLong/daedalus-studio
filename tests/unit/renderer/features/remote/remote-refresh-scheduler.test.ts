import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteRefreshScheduler } from "@/remote/remote-refresh-scheduler";

afterEach((): void => {
	vi.useRealTimers();
});

describe("RemoteRefreshScheduler", () => {
	it("coalesces a continuous event burst and keeps refreshes at the configured interval", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const refreshed: string[] = [];
		const scheduler = new RemoteRefreshScheduler(async (sessionId: string): Promise<void> => {
			refreshed.push(sessionId);
		}, 2_000);

		scheduler.schedule("session-a");
		await vi.runOnlyPendingTimersAsync();
		expect(refreshed).toEqual(["session-a"]);

		scheduler.schedule("session-a");
		scheduler.schedule("session-b");
		await vi.advanceTimersByTimeAsync(1_999);
		expect(refreshed).toEqual(["session-a"]);
		await vi.advanceTimersByTimeAsync(1);
		expect(refreshed).toEqual(["session-a", "session-b"]);

		scheduler.dispose();
	});

	it("waits for an in-flight refresh and runs one trailing refresh for the latest session", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		let finishRefresh: () => void = (): void => {};
		const refreshed: string[] = [];
		const scheduler = new RemoteRefreshScheduler(async (sessionId: string): Promise<void> => {
			refreshed.push(sessionId);
			await new Promise<void>((resolve): void => {
				finishRefresh = resolve;
			});
		}, 2_000);

		scheduler.schedule("session-a");
		await vi.advanceTimersByTimeAsync(0);
		scheduler.schedule("session-b");
		scheduler.schedule("session-c");
		expect(refreshed).toEqual(["session-a"]);

		finishRefresh();
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(2_000);
		expect(refreshed).toEqual(["session-a", "session-c"]);

		scheduler.dispose();
	});
});
