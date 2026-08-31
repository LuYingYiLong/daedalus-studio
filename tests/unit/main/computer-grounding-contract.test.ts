import { describe, expect, it } from "vitest";
import { parseComputerGroundingResult, parseComputerGroundings, parseComputerGroundingValidation } from "../../../src/contracts/computer-grounding";

const box = { x: 0, y: 2, width: 10, height: 5 };
const matched = { description: "Save button", box, status: "matched", nodeId: "button", supportedActions: ["uia_invoke"] };
const visual = { description: "Save icon", box, status: "visual_only" };
const ambiguous = { description: "Overlapping controls", box, status: "ambiguous" };
const result = {
  groundingId: "grounding-1", observationId: "frame-1", generation: 0,
  target: "Save", uiaAction: "uia_invoke", coordinateSpace: "image_pixels",
  status: "matched", candidates: [matched], provider: "provider", model: "model",
  durationMs: 0, untrustedEvidence: true,
};

describe("independent grounding evidence contract", () => {
  it.each([
    { status: "matched", candidates: [matched] },
    { status: "visual_only", candidates: [visual] },
    { status: "ambiguous", candidates: [ambiguous] },
    { status: "ambiguous", candidates: [matched, visual] },
    { status: "not_found", candidates: [] },
  ])("accepts backend $status status/candidate semantics", patch => {
    const value = { ...result, ...patch };
    expect(parseComputerGroundingResult(value)).toEqual(value);
  });

  it.each([
    { groundingId: "../receipt" }, { observationId: "" }, { generation: -1 }, { generation: 0.5 },
    { target: "x".repeat(2001) }, { uiaAction: "click" }, { coordinateSpace: "screen_pixels" },
    { provider: "" }, { model: "" }, { model: "x".repeat(301) }, { durationMs: Infinity }, { durationMs: -1 },
    { untrustedEvidence: false }, { status: "not_found" }, { status: "ambiguous" }, { candidates: [] },
    { status: "matched", candidates: [matched, matched] }, { status: "ambiguous", candidates: Array(6).fill(matched) },
    { x: 12 }, { hwnd: 123 }, { action: { type: "click" } }, { dataUrl: "data:image/png;base64,AQID" },
  ])("rejects invalid or additional result data %j", patch => {
    expect(() => parseComputerGroundingResult({ ...result, ...patch })).toThrow();
  });

  it.each([
    { ...matched, nodeId: undefined }, { ...matched, nodeId: "../node" }, { ...matched, supportedActions: [] },
    { ...matched, supportedActions: ["click"] }, { ...matched, supportedActions: Array(7).fill("uia_invoke") },
    { ...matched, status: "not_found" }, { ...matched, description: "x".repeat(1001) }, { ...matched, hwnd: 1 },
    { ...matched, box: { ...box, x: -1 } }, { ...matched, box: { ...box, y: NaN } },
    { ...matched, box: { ...box, width: 0 } }, { ...matched, box: { ...box, height: Infinity } },
    { ...matched, box: { ...box, coordinateSpace: "screen_pixels" } },
    { ...visual, nodeId: "node" }, { ...visual, supportedActions: [] }, { ...ambiguous, nodeId: "node" },
  ])("rejects invalid or actionable unmatched candidates %j", candidate => {
    expect(() => parseComputerGroundingResult({ ...result, status: candidate.status, candidates: [candidate] })).toThrow();
  });

  it("requires every result field and keeps validation strict", () => {
    for (const key of Object.keys(result)) {
      const value: Record<string, unknown> = { ...result };
      delete value[key];
      expect(() => parseComputerGroundingResult(value)).toThrow();
    }
    expect(parseComputerGroundingValidation({ observationId: "frame", generation: 0, valid: true })).toEqual({ observationId: "frame", generation: 0, valid: true });
    for (const patch of [{ valid: false }, { generation: -1 }, { generation: "0" }, { dataUrl: "pixels" }])
      expect(() => parseComputerGroundingValidation({ observationId: "frame", generation: 0, valid: true, ...patch })).toThrow();
  });

  it("bounds and validates the history list independently", () => {
    expect(parseComputerGroundings([])).toEqual([]);
    expect(parseComputerGroundings([result])).toEqual([result]);
    for (const value of [{}, null, Array(11).fill(result), [result, { ...result, untrustedEvidence: false }]])
      expect(() => parseComputerGroundings(value)).toThrow();
  });
});
