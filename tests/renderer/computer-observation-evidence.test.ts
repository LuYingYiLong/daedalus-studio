import { describe, expect, it, vi } from "vitest";
import { parseComputerObservationDetail } from "@/features/computer-observation/useComputerObservationHistory";
import type { ComputerObservation } from "../../src/contracts/computer-observation";
import type { ComputerGroundingResult } from "../../src/contracts/computer-grounding";

vi.mock("@/platform/rpc/transport/backend-client", () => ({
	createBackendClient: vi.fn(),
}));
vi.mock("@/platform/runtime/platform-runtime", () => ({
	getPlatformRuntime: vi.fn(),
}));
vi.mock("@/features/computer-observation/useComputerState", () => ({
	useComputerDeveloperMode: vi.fn(),
}));

const observation: ComputerObservation = {
	observationId: "frame-1",
	capturedAt: "2026-08-31T00:00:00.000Z",
	uiaCapturedAt: "2026-08-31T00:00:00.000Z",
	screenBounds: { x: -100, y: 20, width: 100, height: 80 },
	width: 100,
	height: 80,
	dpi: 144,
	durationMs: 10,
	nodes: [],
	texts: [],
	truncated: false,
};
const grounding: ComputerGroundingResult = {
	groundingId: "grounding-1",
	observationId: "frame-1",
	generation: 1,
	target: "Find the confirmation button",
	uiaAction: "uia_invoke",
	coordinateSpace: "image_pixels",
	status: "visual_only",
	candidates: [
		{
			description: "Confirm",
			status: "visual_only",
			box: { x: 20, y: 30, width: 40, height: 10 },
		},
	],
	provider: "fixture-provider",
	model: "fixture-model",
	durationMs: 150,
	untrustedEvidence: true,
};
const dataUrl = "data:image/png;base64,AQ==";

describe("computer history evidence boundary", () => {
	it("reads grounding siblings without modifying the observation or screenshot coordinates", () => {
		const result = parseComputerObservationDetail(
			{ detailLevel: "full", observation, dataUrl, groundings: [grounding] },
			"frame-1",
		);
		expect(result.observation).toEqual({ ...observation, dataUrl });
		expect(result.observation).not.toHaveProperty("groundings");
		expect(result.groundings).toEqual([grounding]);
		expect(result.groundings[0].candidates[0].box).toEqual({
			x: 20,
			y: 30,
			width: 40,
			height: 10,
		});
		expect(observation).not.toHaveProperty("dataUrl");
	});
	it("accepts old full details with no grounding field", () => {
		expect(
			parseComputerObservationDetail(
				{ detailLevel: "full", observation },
				"frame-1",
			),
		).toEqual({ observation, groundings: [] });
	});
	it("rejects out-of-frame boxes without clipping and accepts exact image edges", () => {
		for (const box of [
			{ x: 99, y: 0, width: 2, height: 1 },
			{ x: 0, y: 80, width: 1, height: 1 },
			{ x: 0, y: 0, width: Number.MAX_VALUE, height: 1 },
		]) expect(() => parseComputerObservationDetail({ detailLevel: "full", observation,
			groundings: [{ ...grounding, candidates: [{ ...grounding.candidates[0], box }] }] }, "frame-1"))
			.toThrow("computer_grounding_invalid_response");
		expect(parseComputerObservationDetail({ detailLevel: "full", observation,
			groundings: [{ ...grounding, candidates: [{ ...grounding.candidates[0], box: { x: 99, y: 79, width: 1, height: 1 } }] }] }, "frame-1").groundings).toHaveLength(1);
	});
	it.each(["summary", "compacted"] as const)(
		"%s never exposes or parses unexpected detail bodies",
		(detailLevel) => {
			expect(
				parseComputerObservationDetail(
					{
						detailLevel,
						observation: "private invalid payload",
						dataUrl,
						groundings: [grounding],
					},
					"frame-1",
				),
			).toEqual({ observation: null, groundings: [] });
		},
	);
	it("rejects evidence for a different frame instead of highlighting the current screenshot", () => {
		expect(() =>
			parseComputerObservationDetail(
				{ detailLevel: "full", observation, groundings: [grounding] },
				"frame-2",
			),
		).toThrow("computer_observation_mismatch");
		expect(() =>
			parseComputerObservationDetail(
				{
					detailLevel: "full",
					observation,
					groundings: [{ ...grounding, observationId: "frame-2" }],
				},
				"frame-1",
			),
		).toThrow("computer_observation_mismatch");
	});
	it("fails closed on malformed full evidence", () => {
		expect(() =>
			parseComputerObservationDetail(
				{
					detailLevel: "full",
					observation,
					groundings: [{ ...grounding, untrustedEvidence: false }],
				},
				"frame-1",
			),
		).toThrow();
		expect(() =>
			parseComputerObservationDetail(
				{
					detailLevel: "full",
					observation,
					groundings: [{ ...grounding, coordinateSpace: "screen_pixels" }],
				},
				"frame-1",
			),
		).toThrow();
	});
});
