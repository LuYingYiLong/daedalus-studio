import { describe, expect, it } from "vitest";
import {
	findMatchingShortcutCommand,
	findShortcutConflict,
	formatShortcutBinding,
	getEffectiveShortcutBinding,
	matchesShortcutKeyboardEvent,
	normalizeKeyboardShortcutOverrides,
	normalizeShortcutBinding,
	shortcutBindingFromKeyboardEvent,
	type ShortcutKeyboardEvent
} from "../../src/contracts/keyboard-shortcuts";

function keyboardEvent(
	code: string,
	options: Partial<ShortcutKeyboardEvent> = {}
): ShortcutKeyboardEvent {
	return {
		key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code,
		code,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		...options
	};
}

describe("keyboard shortcuts", () => {
	it("normalizes modifier order and rejects unsupported plain printable keys", () => {
		expect(normalizeShortcutBinding("alt+mod+KeyB")).toBe("Mod+Alt+KeyB");
		expect(normalizeShortcutBinding("PageUp")).toBe("PageUp");
		expect(normalizeShortcutBinding("KeyB")).toBeNull();
		expect(normalizeShortcutBinding("Mod+Unknown")).toBeNull();
	});

	it("captures and formats the primary modifier for each platform", () => {
		expect(shortcutBindingFromKeyboardEvent(keyboardEvent("KeyB", { ctrlKey: true }), "other")).toBe("Mod+KeyB");
		expect(shortcutBindingFromKeyboardEvent(keyboardEvent("KeyB", { metaKey: true }), "mac")).toBe("Mod+KeyB");
		expect(formatShortcutBinding("Mod+Alt+KeyB", "other")).toBe("Ctrl+Alt+B");
		expect(formatShortcutBinding("Mod+Alt+KeyB", "mac")).toBe("Cmd+Option+B");
	});

	it("matches effective shortcuts and resolves commands", () => {
		const event: ShortcutKeyboardEvent = keyboardEvent("KeyJ", { ctrlKey: true });
		expect(matchesShortcutKeyboardEvent(event, "Mod+KeyJ", "other")).toBe(true);
		expect(findMatchingShortcutCommand(event, {}, "other")).toBe("workbench.toggleBottomPanel");
		expect(findMatchingShortcutCommand(keyboardEvent("KeyN", { ctrlKey: true }), {}, "other")).toBe("session.new");
		expect(findMatchingShortcutCommand(keyboardEvent("PageUp", { ctrlKey: true }), {}, "other")).toBe("session.previous");
		expect(findMatchingShortcutCommand(keyboardEvent("PageDown", { ctrlKey: true }), {}, "other")).toBe("session.next");
		expect(findMatchingShortcutCommand(event, {
			"workbench.toggleBottomPanel": "Mod+KeyK"
		}, "other")).toBeNull();
		expect(getEffectiveShortcutBinding({
			"workbench.toggleBottomPanel": "Mod+KeyK"
		}, "workbench.toggleBottomPanel")).toBe("Mod+KeyK");
	});

	it("detects conflicts and drops invalid or conflicting persisted overrides", () => {
		expect(findShortcutConflict(
			{},
			"workbench.toggleWorkspaceSidebar",
			"Mod+KeyJ",
			"other"
		)?.id).toBe("workbench.toggleBottomPanel");
		expect(normalizeKeyboardShortcutOverrides({
			"workbench.toggleWorkspaceSidebar": "Mod+KeyJ",
			"conversation.previousTurn": "KeyP",
			unknown: "Mod+KeyU"
		}, "other")).toEqual({});
	});
});
