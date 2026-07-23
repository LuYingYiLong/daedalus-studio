import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ImageGenerationPart", () => {
	it("renders the model label and prompt as separate text rows", () => {
		const componentSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "ImageGenerationPart.tsx");
		const cssSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "ImageGenerationPart.module.css");

		expect(componentSource).toContain('className={styles.modelLabel}');
		expect(componentSource).toContain('className={styles.prompt}');
		expect(cssSource).toMatch(/\.modelLabel\s*{[^}]*display:\s*block;/);
		expect(cssSource).toMatch(/\.prompt\s*{[^}]*display:\s*block;/);
	});
});
