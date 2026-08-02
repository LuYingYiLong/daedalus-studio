import { describe, expect, it } from "vitest";
import { parseComposerModeCommand } from "@/features/composer/composer-mode-command";

describe("composer mode commands", () => {
	it.each([
		["/ask What does this mean?", "ask", "What does this mean?"],
		[" /agent 修复这个错误", "agent", "修复这个错误"],
		["/plan\n规划一下重构", "plan", "规划一下重构"],
		["/GOAL 完成登录流程", "goal", "完成登录流程"]
	] as const)("parses %s without sending the command text", (value, mode, message): void => {
		expect(parseComposerModeCommand(value)).toEqual({ mode, message });
	});

	it("does not treat unrelated slash text as a mode command", (): void => {
		expect(parseComposerModeCommand("/help")).toBeNull();
		expect(parseComposerModeCommand("please /ask this")).toBeNull();
	});
});
