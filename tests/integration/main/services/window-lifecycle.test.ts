import { describe, expect, it } from "vitest";
import { DEFAULT_CLIENT_PREFERENCES } from "@main/services/client-preferences-store";
import { getTrayMenuLabels, shouldMinimizeToTrayOnClose } from "@main/services/window-lifecycle";

describe("window lifecycle", () => {
	it("hides to tray only when enabled and not quitting", () => {
		expect(shouldMinimizeToTrayOnClose(DEFAULT_CLIENT_PREFERENCES, false)).toBe(false);
		expect(shouldMinimizeToTrayOnClose({
			...DEFAULT_CLIENT_PREFERENCES,
			minimizeToTrayOnClose: true
		}, false)).toBe(true);
		expect(shouldMinimizeToTrayOnClose({
			...DEFAULT_CLIENT_PREFERENCES,
			minimizeToTrayOnClose: true
		}, true)).toBe(false);
	});

	it("localizes tray menu labels from the preferred or system language", () => {
		expect(getTrayMenuLabels("zh-CN", "en-US").newChat).toBe("新建聊天");
		expect(getTrayMenuLabels("en-US", "zh-CN").exit).toBe("Exit");
		expect(getTrayMenuLabels("system", "zh-CN").recent).toBe("最近会话");
	});
});
