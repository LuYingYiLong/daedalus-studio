import { describe, expect, it } from "vitest";
import { readRepoFile } from "../helpers/repo-paths";

describe("Windows Backend bootstrap archive", () => {
	const source: string = readRepoFile("scripts", "prepare-backend-bootstrap.cjs");

	it("accepts only the required payload files and the contained media runtime", () => {
		expect(source).toContain("$normalizedName.StartsWith('media/')");
		expect(source).toContain("$entryName.Contains([char]92)");
		expect(source).toContain("Archive entry escapes destination");
		expect(source).toContain("$maxUncompressedBytes = [long]536870912");
		expect(source).toContain("const mediaPath = join(payloadDir, \"media\");");
		expect(source).toContain("join(mediaPath, \"node_modules\", \"sharp\", \"package.json\")");
	});

	it("installs the verified image runtime beside the backend executable", () => {
		expect(source).toContain("cpSync(payload.mediaPath, join(tempDir, \"media\"),");
		expect(source).toContain("image-worker.cjs");
		expect(source).toContain("node_modules");
	});
});
