import { describe, expect, it } from "vitest";
import { createMcpServerAddPayload, createMcpServerUpdatePayload, parseEnvLines, parseHeaderLines, parseLineList } from "@/pages/settings/mcp-form-utils";

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

	it("creates update payloads and allows empty existing secrets", () => {
		const stdioPayload = createMcpServerUpdatePayload("custom-demo", {
			name: "Ignored",
			description: "",
			transport: "stdio",
			command: "npx",
			args: "-y\nserver",
			env: "TOKEN=\nNEW_TOKEN=abc"
		});
		expect(stdioPayload).toEqual({
			serverId: "custom-demo",
			description: "",
			transport: "stdio",
			command: "npx",
			args: ["-y", "server"],
			env: {
				TOKEN: "",
				NEW_TOKEN: "abc"
			}
		});
		expect("name" in stdioPayload).toBe(false);

		const httpPayload = createMcpServerUpdatePayload("custom-http", {
			name: "Ignored",
			description: "Updated",
			transport: "http",
			url: "https://example.com/mcp",
			headers: "Authorization:\nX-API-Key: value"
		});
		expect(httpPayload).toEqual({
			serverId: "custom-http",
			description: "Updated",
			transport: "http",
			url: "https://example.com/mcp",
			headers: {
				Authorization: "",
				"X-API-Key": "value"
			}
		});
		expect("name" in httpPayload).toBe(false);
	});
});
