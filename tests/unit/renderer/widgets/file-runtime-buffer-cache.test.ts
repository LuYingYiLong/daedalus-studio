import { describe, expect, it } from "vitest";
import { FileRuntimeBufferCache } from "@/widgets/files/file-runtime-buffer-cache";

type TestBuffer = { content: string; savedContent?: string; isDirty: boolean };

const clean = (content: string): TestBuffer => ({ content, isDirty: false });
const dirty = (content: string, savedContent: string): TestBuffer => ({ content, savedContent, isDirty: true });

describe("FileRuntimeBufferCache", () => {
	it("evicts the oldest clean entries by count", () => {
		const cache = new FileRuntimeBufferCache<TestBuffer>(2, 1000);
		cache.set("one", clean("1"));
		cache.set("two", clean("2"));
		cache.get("one");
		cache.set("three", clean("3"));
		expect(cache.get("one")?.content).toBe("1");
		expect(cache.get("two")).toBeUndefined();
		expect(cache.get("three")?.content).toBe("3");
	});

	it("does not evict dirty buffers", () => {
		const cache = new FileRuntimeBufferCache<TestBuffer>(1, 2);
		cache.set("dirty", dirty("changed", "original"));
		cache.set("clean", clean("clean"));
		expect(cache.get("dirty")?.content).toBe("changed");
		expect(cache.get("clean")).toBeUndefined();
	});

	it("deletes closed buffers and reports only clean bytes", () => {
		const cache = new FileRuntimeBufferCache<TestBuffer>(16, 1000);
		cache.set("dirty", dirty("changed", "original"));
		cache.set("clean", clean("clean"));
		expect(cache.stats().cleanEntryCount).toBe(1);
		cache.delete("clean");
		expect(cache.stats()).toMatchObject({ entryCount: 1, cleanEntryCount: 0, cleanBytes: 0 });
	});
});
