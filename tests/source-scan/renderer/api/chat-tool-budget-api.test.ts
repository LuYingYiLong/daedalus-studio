import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("chat tool budget API source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "api", "chat-api.ts");

	it("calls the backend tool budget decision RPCs", () => {
		expect(source).toContain("continueToolBudget");
		expect(source).toContain("\"ai.toolBudget.continue\"");
		expect(source).toContain("stopToolBudget");
		expect(source).toContain("\"ai.toolBudget.stop\"");
	});
});
