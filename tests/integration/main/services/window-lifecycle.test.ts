import { describe, expect, it } from "vitest";
import { DEFAULT_CLIENT_PREFERENCES } from "./client-preferences-store";
import { shouldMinimizeToTrayOnClose } from "./window-lifecycle";

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
});
