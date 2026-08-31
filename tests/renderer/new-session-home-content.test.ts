import { describe, expect, it } from "vitest";
import {
	getNewSessionGreetingPeriod,
	UNBOUND_STARTER_IDS,
	WORKSPACE_STARTER_IDS
} from "@/domain/session/new-session-home-content";

describe("new session home content", () => {
	it("selects a human greeting for each part of the day", () => {
		expect(getNewSessionGreetingPeriod(0)).toBe("morning");
		expect(getNewSessionGreetingPeriod(11)).toBe("morning");
		expect(getNewSessionGreetingPeriod(12)).toBe("afternoon");
		expect(getNewSessionGreetingPeriod(17)).toBe("afternoon");
		expect(getNewSessionGreetingPeriod(18)).toBe("evening");
	});

	it("keeps workspace and unbound suggestions explicit and reversible", () => {
		expect(WORKSPACE_STARTER_IDS).toEqual(["explore", "next_step", "plan"]);
		expect(UNBOUND_STARTER_IDS).toEqual(["explore", "plan", "next_step"]);
	});
});
