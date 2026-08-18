import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source: string = readFileSync(
	resolve(process.cwd(), "src/renderer/src/widgets/browser/BrowserToolbar.tsx"),
	"utf8"
);

describe("BrowserToolbar", () => {
	it("keeps page annotation independent from stored credentials", () => {
		expect(source).toContain("{state.url === null ? null : (\n\t\t\t\t<Tooltip title={labels.inspect}");
		expect(source).toContain("{state.url === null || !hasCredentials ? null : (\n\t\t\t\t<Tooltip title={labels.credentials}");
	});
});
