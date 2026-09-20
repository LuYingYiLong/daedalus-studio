import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowCanvasStore, FlowGeometryStore, FlowKeyedStore, FlowSpatialIndex } from "@/domain/flow/flow-render-stores";

afterEach(() => vi.useRealTimers());
describe("Flow rendering stores", () => {
	it("notifies only the changed entity and preserves unchanged identities", () => {
		const store = new FlowKeyedStore<{ value: string }>();
		const a = vi.fn(),
			b = vi.fn();
		store.subscribe("a", a);
		store.subscribe("b", b);
		const value = { value: "updated" };
		store.set("a", value);
		store.set("a", value);
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).not.toHaveBeenCalled();
	});
	it("retains zoom detail within the hysteresis interval", () => {
		const canvas = new FlowCanvasStore();
		expect(canvas.updateDetail(0.5)).toBe(true);
		expect(canvas.updateDetail(0.16)).toBe(true);
		expect(canvas.updateDetail(0.15)).toBe(false);
		expect(canvas.updateDetail(0.24)).toBe(false);
		expect(canvas.updateDetail(0.25)).toBe(true);
		canvas.pin("editing", true);
		expect(canvas.getMode("editing")).toBe("full");
		expect(canvas.getMode("merely-selected")).toBe("outline");
	});
	it("keeps a pending draft independently of a subscriber and commits it once", () => {
		vi.useFakeTimers();
		const canvas = new FlowCanvasStore();
		const commit = vi.fn();
		const unsubscribe = canvas.drafts.subscribe("a", vi.fn());
		canvas.updateDraft("a", { text: "draft" }, commit, false);
		unsubscribe();
		canvas.acceptConfig("a", { text: "old server value" });
		expect(canvas.drafts.get("a")).toEqual({ text: "draft" });
		vi.advanceTimersByTime(250);
		canvas.flush();
		expect(commit).toHaveBeenCalledExactlyOnceWith({ text: "draft" });
		canvas.dispose();
		expect(commit).toHaveBeenCalledTimes(1);
	});
	it("groups an editing focus session and rejects its generation after disposal", () => {
		const canvas = new FlowCanvasStore();
		canvas.pin("a", true);
		const group = canvas.editGroups.get("a");
		canvas.pin("a", true);
		expect(canvas.editGroups.get("a")).toBe(group);
		canvas.pin("a", false);
		canvas.pin("a", true);
		expect(canvas.editGroups.get("a")).not.toBe(group);
		const generation = canvas.generation;
		canvas.dispose();
		expect(canvas.generation).not.toBe(generation);
		expect(canvas.editGroups.size).toBe(0);
	});
	it("discards deleted drafts while flushing surviving drafts on disposal", () => {
		vi.useFakeTimers();
		const canvas = new FlowCanvasStore();
		const commit = vi.fn();
		canvas.updateDraft("deleted", {}, commit, false);
		canvas.removeNode("deleted");
		canvas.updateDraft("alive", { value: 2 }, commit, false);
		canvas.dispose();
		vi.runAllTimers();
		expect(commit).toHaveBeenCalledExactlyOnceWith({ value: 2 });
	});
	it("queries intersecting geometry including cross-screen edges with offscreen endpoints", () => {
		const index = new FlowSpatialIndex(100);
		index.set("crossing", { x: -10_000, y: 50, width: 20_000, height: 1 });
		index.set("touching", { x: 100, y: 10, width: 20, height: 20 });
		index.set("outside", { x: 101, y: 101, width: 1, height: 1 });
		expect([...index.query({ x: 0, y: 0, width: 100, height: 100 })].sort()).toEqual(["crossing", "touching"]);
		index.set("touching", { x: 200, y: 200, width: 20, height: 20 });
		index.delete("crossing");
		expect(index.query({ x: 0, y: 0, width: 100, height: 100 }).size).toBe(0);
	});
	it("does not publish geometry for a repeated measurement", () => {
		const store = new FlowGeometryStore();
		const changed = vi.fn();
		store.subscribe("a", changed);
		const geometry = { x: 0, y: 0, width: 320, height: 240, handles: [], color: "brown", selected: false };
		store.set("a", geometry);
		store.set("a", { ...geometry, handles: [] });
		expect(changed).toHaveBeenCalledTimes(1);
		store.set("a", { ...geometry, x: 700 });
		expect(store.nodes.query({ x: 0, y: 0, width: 400, height: 400 }).size).toBe(0);
		expect(changed).toHaveBeenCalledTimes(2);
	});
});
