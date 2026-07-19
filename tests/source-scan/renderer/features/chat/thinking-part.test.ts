import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ThinkingPart source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "features", "chat", "ThinkingPart.tsx");

	it("animates the active thinking label without affecting completed thinking parts", () => {
		expect(source).toContain("[\"Thinking\", \"Thinking.\", \"Thinking..\", \"Thinking...\"]");
		expect(source).toContain("window.setInterval");
		expect(source).toContain("window.clearInterval");
		expect(source).toContain("part.done ? \"Thinking\" : ACTIVE_THINKING_LABELS[labelIndex]");
	});
});
