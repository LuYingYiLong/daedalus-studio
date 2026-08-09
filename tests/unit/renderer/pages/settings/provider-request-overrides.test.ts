import { describe, expect, it } from "vitest";
import {
	cloneProviderRequestOverrides,
	parseProviderRequestOverrides
} from "@/domain/settings/provider-request-overrides";

describe("provider request overrides", () => {
	it("accepts provider extension headers and JSON body fields", () => {
		expect(parseProviderRequestOverrides({
			headers: { "X-Provider-Feature": "enabled" },
			body: { enable_thinking: false, nested: { level: 2 } }
		})).toEqual({
			value: {
				headers: { "X-Provider-Feature": "enabled" },
				body: { enable_thinking: false, nested: { level: 2 } }
			},
			error: null
		});
	});

	it("rejects malformed editor values before they reach the backend", () => {
		expect(parseProviderRequestOverrides([]).error).toContain("root");
		expect(parseProviderRequestOverrides({ query: {} }).error).toContain("topLevel");
		expect(parseProviderRequestOverrides({ headers: { accept: 2 } }).error).toContain("headers");
		expect(parseProviderRequestOverrides({ body: [] }).error).toContain("body");
	});

	it("clones saved values before an editor can mutate its draft", () => {
		const saved = { headers: { "X-Test": "one" }, body: { feature: true } };
		const cloned = cloneProviderRequestOverrides(saved);
		cloned.headers["X-Test"] = "two";
		cloned.body.feature = false;

		expect(saved).toEqual({ headers: { "X-Test": "one" }, body: { feature: true } });
	});
});
