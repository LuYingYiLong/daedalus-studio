import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR: string = dirname(fileURLToPath(import.meta.url));

describe("Composer todo preferences", () => {
	it("does not apply global todo auto expand preference inside Composer", () => {
		const source = readFileSync(join(TEST_DIR, "Composer.tsx"), "utf8");

		expect(source).not.toContain("autoExpandWorkflowTodo");
		expect(source).toContain("if (dismissedWorkflowTodoKeyRef.current !== workflowTodoKey)");
		expect(source).toContain("setTodoPanelOpen(true)");
	});
});
