import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("MessageSelectionOverlay", () => {
	it("provides Ask-only context menu deletion actions", () => {
		const source = readFileSync(path.resolve("src/renderer/src/widgets/conversation/MessageSelectionOverlay.tsx"), "utf8");

		expect(source).toContain('trigger={["contextMenu"]}');
		expect(source).toContain('key: "delete"');
		expect(source).toContain('key: "deleteAll"');
		expect(source).toContain("onDeleteAsk(threadId)");
		expect(source).toContain("onDeleteAllAsks()");
		expect(source).not.toContain("onDeleteContext");
	});
});
