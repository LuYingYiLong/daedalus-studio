import { describe, expect, it } from "vitest";
import {
	ConversationSearchEngine,
	extractMarkdownVisibleBlocks
} from "@/domain/conversation/conversation-search-engine";

describe("conversation search engine", () => {
	it("extracts visible Markdown text without formatting, link targets, images, or raw HTML", () => {
		expect(extractMarkdownVisibleBlocks([
			"# Visible **heading**",
			"",
			"Open [documentation](https://example.com/private-path) with `Node2D`.",
			"",
			"![hidden image metadata](https://example.com/image.png)",
			"",
			"<span>hidden html</span>",
			"",
			"```gdscript",
			"var speed = 10",
			"```"
		].join("\n"))).toEqual([
			"Visible heading",
			"Open documentation with Node2D.",
			"var speed = 10"
		]);
	});

	it("matches case-insensitive literal substrings with Unicode and non-overlapping counts", () => {
		const engine = new ConversationSearchEngine();
		engine.upsertDocuments([{
			blockOffset: 4,
			requestId: "request-a",
			role: "assistant",
			markdownSegments: ["ÄPFEL 与中文，a.a.a，aaaa"]
		}]);

		expect(engine.search("äpfel").total).toBe(1);
		expect(engine.search("中文").total).toBe(1);
		expect(engine.search("a.a").total).toBe(1);
		const repeated = engine.search("aa");
		expect(repeated.total).toBe(2);
		expect(repeated.match).toEqual({
			blockOffset: 4,
			requestId: "request-a",
			role: "assistant",
			occurrenceIndexInBlock: 1
		});
		expect(engine.resolve(1)?.occurrenceIndexInBlock).toBe(1);
	});

	it("does not match across Markdown blocks or messages", () => {
		const engine = new ConversationSearchEngine();
		engine.upsertDocuments([
			{
				blockOffset: 0,
				requestId: "request-a",
				role: "user",
				markdownSegments: ["first"]
			},
			{
				blockOffset: 1,
				requestId: "request-a",
				role: "assistant",
				markdownSegments: ["second\n\nthird"]
			}
		]);

		expect(engine.search("firstsecond").total).toBe(0);
		expect(engine.search("secondthird").total).toBe(0);
		expect(engine.search("third").match?.blockOffset).toBe(1);
	});

	it("replaces loaded documents by block offset for streaming updates", () => {
		const engine = new ConversationSearchEngine();
		engine.upsertDocuments([{
			blockOffset: 8,
			requestId: "request-stream",
			role: "assistant",
			markdownSegments: ["partial"]
		}]);
		expect(engine.search("complete").total).toBe(0);

		engine.upsertDocuments([{
			blockOffset: 8,
			requestId: "request-stream",
			role: "assistant",
			markdownSegments: ["complete response"]
		}]);
		expect(engine.search("partial").total).toBe(0);
		expect(engine.search("complete").total).toBe(1);
	});

	it("starts at the newest match when no ordinal is requested", () => {
		const engine = new ConversationSearchEngine();
		engine.upsertDocuments([
			{
				blockOffset: 2,
				requestId: "request-old",
				role: "user",
				markdownSegments: ["result"]
			},
			{
				blockOffset: 9,
				requestId: "request-new",
				role: "assistant",
				markdownSegments: ["result and result"]
			}
		]);

		const search = engine.search("result");
		expect(search.total).toBe(3);
		expect(search.ordinal).toBe(2);
		expect(search.match).toEqual({
			blockOffset: 9,
			requestId: "request-new",
			role: "assistant",
			occurrenceIndexInBlock: 1
		});
	});
});
