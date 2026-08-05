import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root: string = path.resolve(__dirname, "../../../../..");
const terminalPartSource: string = fs.readFileSync(path.join(root, "src/renderer/src/features/chat/TerminalPart.tsx"), "utf8");
const messageListSource: string = fs.readFileSync(path.join(root, "src/renderer/src/features/chat/MessageList.tsx"), "utf8");

describe("TerminalPart scroll handoff", (): void => {
	it("hands non-scrollable output wheel input to the virtual message list", (): void => {
		expect(terminalPartSource).toContain("canConsumeOutputWheel(element, event.deltaY)");
		expect(terminalPartSource).toContain("onScrollWheelPassThrough(event.deltaY)");
		expect(messageListSource).toContain("const handleTerminalWheelPassThrough");
		expect(messageListSource).toContain("scroller.scrollTop += deltaY");
	});
});
