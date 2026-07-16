import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createMcpServerAddPayload, parseEnvLines, parseHeaderLines, parseLineList } from "./mcp-form-utils";

const TEST_DIR: string = dirname(fileURLToPath(import.meta.url));

describe("mcp-form-utils", () => {
	it("parses multiline args, env and headers", () => {
		expect(parseLineList("arg1\n\n arg2 ")).toEqual(["arg1", "arg2"]);
		expect(parseEnvLines("TOKEN=abc\nMODE = dev")).toEqual({
			TOKEN: "abc",
			MODE: "dev"
		});
		expect(parseHeaderLines("Authorization: Bearer token\nContent-Type: application/json")).toEqual({
			Authorization: "Bearer token",
			"Content-Type": "application/json"
		});
	});

	it("rejects malformed env and headers", () => {
		expect(() => parseEnvLines("TOKEN")).toThrow(/Invalid env entry/u);
		expect(() => parseHeaderLines("Authorization")).toThrow(/Invalid header entry/u);
	});

	it("creates stdio and http payloads without plan access", () => {
		const stdioPayload = createMcpServerAddPayload({
			name: "Demo",
			description: "Tools",
			transport: "stdio",
			command: "npx",
			args: "-y\nserver",
			env: "TOKEN=abc"
		});
		expect(stdioPayload).toEqual({
			name: "Demo",
			description: "Tools",
			transport: "stdio",
			command: "npx",
			args: ["-y", "server"],
			env: { TOKEN: "abc" }
		});
		expect("planAccess" in stdioPayload).toBe(false);

		const httpPayload = createMcpServerAddPayload({
			name: "HTTP",
			transport: "http",
			url: "https://example.com/mcp",
			headers: "Authorization: Bearer token"
		});
		expect(httpPayload).toEqual({
			name: "HTTP",
			description: undefined,
			transport: "http",
			url: "https://example.com/mcp",
			headers: { Authorization: "Bearer token" }
		});
		expect("planAccess" in httpPayload).toBe(false);
	});

	it("does not render a plan access field in the settings page", () => {
		const source = readFileSync(join(TEST_DIR, "McpServersSettingsPage.tsx"), "utf8");
		expect(source).not.toContain("Plan access");
		expect(source).not.toContain("planAccess");
	});
});
