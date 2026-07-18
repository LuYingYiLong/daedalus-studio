import { describe, expect, it } from "vitest";
import type { AdditionalContextItem } from "@/api/types";
import { summarizeAdditionalContextItem } from "@/features/bubble/additional-context-display";

describe("additional-context-display", () => {
	it("summarizes filesystem selections with item counts and tooltip paths", () => {
		const item: AdditionalContextItem = {
			id: "ctx-1",
			kind: "filesystem_selection",
			title: "Selected files",
			source: "manual",
			data: {
				selectedPaths: [
					{ kind: "file", resourcePath: "res://scripts/player.gd" },
					{ kind: "folder", resourcePath: "res://scenes" }
				]
			}
		};

		const display = summarizeAdditionalContextItem(item);

		expect(display.iconName).toBe("folder_browse");
		expect(display.meta).toBe("1 file · 1 folder");
		expect(display.tooltip).toContain("file: res://scripts/player.gd");
		expect(display.tooltip).toContain("folder: res://scenes");
	});

	it("uses script visuals for script selections", () => {
		const item: AdditionalContextItem = {
			id: "ctx-2",
			kind: "script_selection",
			title: "player.gd",
			source: "editor",
			data: {
				lineStart: 12,
				lineEnd: 16
			}
		};

		const display = summarizeAdditionalContextItem(item);

		expect(display.iconName).toBe("script");
		expect(display.meta).toBe("Lines 12-16");
	});

	it("uses dedicated node and scene icons", () => {
		const nodeItem: AdditionalContextItem = {
			id: "ctx-3",
			kind: "node",
			title: "Player",
			source: "editor"
		};
		const sceneItem: AdditionalContextItem = {
			id: "ctx-4",
			kind: "scene",
			title: "Main",
			source: "editor"
		};

		expect(summarizeAdditionalContextItem(nodeItem).iconName).toBe("node");
		expect(summarizeAdditionalContextItem(sceneItem).iconName).toBe("scene_edit");
	});
});
