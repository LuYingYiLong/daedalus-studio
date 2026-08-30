import { afterEach, describe, expect, it, vi } from "vitest";
import { runShutdownSteps } from "@main/services/shutdown";

afterEach(() => vi.useRealTimers());
describe("application shutdown", () => {
	it("times out a stuck gateway and still releases the backend", async () => {
		vi.useFakeTimers();
		const force = vi.fn(); const backend = vi.fn(); const log = vi.fn();
		const completion = runShutdownSteps([
			{ name: "gateway", timeoutMs: 100, run: () => new Promise(() => {}), force },
			{ name: "backend", timeoutMs: 100, run: backend, force: vi.fn() },
		], log);
		await vi.advanceTimersByTimeAsync(101);
		await completion;
		expect(force).toHaveBeenCalledOnce();
		expect(backend).toHaveBeenCalledOnce();
		expect(log).toHaveBeenCalledWith("gateway");
		expect(vi.getTimerCount()).toBe(0);
	});
	it("isolates thrown cleanup, logging and fallback errors", async () => {
		const backend = vi.fn();
		await runShutdownSteps([
			{ name: "gateway", timeoutMs: 100, run: () => { throw Error("failed"); }, force: () => { throw Error("failed"); } },
			{ name: "backend", timeoutMs: 100, run: backend, force: vi.fn() },
		], () => { throw Error("failed"); });
		expect(backend).toHaveBeenCalledOnce();
	});
	it("does not force healthy services", async () => {
		const force = vi.fn(); const log = vi.fn();
		await runShutdownSteps([{ name: "service", timeoutMs: 100, run: async () => {}, force }], log);
		expect(force).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
	});
});
