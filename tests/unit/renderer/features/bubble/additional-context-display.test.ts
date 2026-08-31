import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import type { AdditionalContextItem } from "@/platform/rpc/types";
import { summarizeAdditionalContextItem } from "@/domain/conversation/additional-context-display";

const EN_DISPLAY: Record<string, string> = {
	"chat.contextStrip.display.selection": "Selection",
	"chat.contextStrip.display.fileCount": "{{count}} file",
	"chat.contextStrip.display.fileCount_other": "{{count}} files",
	"chat.contextStrip.display.folderCount": "{{count}} folder",
	"chat.contextStrip.display.folderCount_other": "{{count}} folders",
	"chat.contextStrip.display.selectedCount": "{{count}} selected",
	"chat.contextStrip.display.selectedCount_other": "{{count}} selected",
	"chat.contextStrip.display.line": "Line {{line}}",
	"chat.contextStrip.display.linesRange": "Lines {{start}}-{{end}}",
	"chat.contextStrip.display.fileSize": "{{size}} KiB",
	"chat.contextStrip.display.textAttachment": "Text attachment",
	"chat.contextStrip.display.reviewComment": "Review comment",
	"chat.contextStrip.display.selectedMessageText": "Selected message text",
	"chat.contextStrip.display.webElement": "Web element",
	"chat.contextStrip.display.contextFallback": "Context",
	"chat.contextStrip.display.more": "... {{count}} more",
	"chat.contextStrip.display.more_other": "... {{count}} more",
	"chat.contextStrip.display.pathLabel": "{{kind}}: {{path}}",
	"chat.contextStrip.display.pathFallback": "path",
	"chat.contextStrip.pinned": "Pinned"
};

function createMockT(): TFunction<"common"> {
	const mockT = ((key: string, options?: Record<string, unknown>): string => {
		const count: unknown = options?.count;
		let template: string = EN_DISPLAY[key] ?? key;
		if (typeof count === "number" && count !== 1 && EN_DISPLAY[`${key}_other`] !== undefined) {
			template = EN_DISPLAY[`${key}_other`];
		}
		for (const [name, value] of Object.entries(options ?? {})) {
			template = template.replaceAll(`{{${name}}}`, String(value));
		}
		return template;
	}) as unknown as TFunction<"common">;
	return mockT;
}

const mockT: TFunction<"common"> = createMockT();

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

		const display = summarizeAdditionalContextItem(item, mockT);

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

		const display = summarizeAdditionalContextItem(item, mockT);

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

		expect(summarizeAdditionalContextItem(nodeItem, mockT).iconName).toBe("node");
		expect(summarizeAdditionalContextItem(sceneItem, mockT).iconName).toBe("scene_edit");
	});

	it("uses a chat marker for message-selection context", () => {
		const item: AdditionalContextItem = {
			id: "selection-1",
			kind: "message_selection",
			title: "Selected answer",
			source: "manual",
			data: {
				anchor: {
					entryId: "assistant-1",
					requestId: "request-1",
					role: "assistant",
					segmentKey: "assistant:markdown:0",
					startOffset: 0,
					endOffset: 8,
					quote: "Selected",
					contextBefore: "",
					contextAfter: " answer"
				},
				selectedText: "Selected",
				annotation: "Explain this"
			}
		};

		const display = summarizeAdditionalContextItem(item, mockT);
		expect(display.iconName).toBe("chat");
		expect(display.meta).toBe("Selected message text");
	});

	it("summarizes web elements with their selector and source URL", () => {
		const item: AdditionalContextItem = {
			id: "web-1",
			kind: "web_element",
			title: "Submit",
			source: "manual",
			data: {
				url: "https://example.com/form",
				pageTitle: "Example form",
				selector: "#submit",
				tagName: "BUTTON",
				role: "button",
				accessibleName: "Submit",
				selectedText: "Submit",
				attributes: { id: "submit" },
				annotation: "Check this action"
			}
		};

		const display = summarizeAdditionalContextItem(item, mockT);
		expect(display.iconName).toBe("global");
		expect(display.meta).toBe("button · #submit");
		expect(display.tooltip).toContain("https://example.com/form");
		expect(display.tooltip).toContain("Check this action");
	});
});
