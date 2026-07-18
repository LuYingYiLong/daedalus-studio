import { describe, expect, it } from "vitest";
import { getPickedSkillPath } from "./skill-fs";

describe("skill-fs", () => {
	it("returns null when a skill path picker is cancelled", () => {
		expect(getPickedSkillPath({ canceled: true, filePaths: [] })).toBeNull();
	});

	it("returns the selected skill path", () => {
		expect(getPickedSkillPath({ canceled: false, filePaths: ["C:\\skills\\demo.zip"] })).toBe("C:\\skills\\demo.zip");
	});
});
