import { describe, expect, it } from "vitest";
import { COMPUTER_PROTOCOL_VERSION, parseComputerAction, parseComputerObservation } from "../../../src/contracts/computer-observation";

describe("computer input v3 contracts", () => {
  it("accepts only the explicit UIA union, including empty replacement", () => {
    expect(COMPUTER_PROTOCOL_VERSION).toBe(3);
    for (const action of [
      { type: "uia_invoke", nodeId: "node" }, { type: "uia_toggle", nodeId: "node" }, { type: "uia_select", nodeId: "node" },
      { type: "uia_set_value", nodeId: "node", value: "" },
      { type: "uia_scroll", nodeId: "node", axis: "vertical", amount: "small_increment" },
      { type: "uia_expand_collapse", nodeId: "node", state: "expanded" },
    ]) expect(parseComputerAction(action)).toEqual(action);
  });
  it.each([
    { type: "click", x: 0, y: 0, count: 1 },
    { type: "click", x: 0, y: 0, count: 2 },
    { type: "scroll", x: 50, y: 50, axis: "vertical", amount: 1 },
    { type: "uia_invoke", nodeId: "node", hwnd: 12 }, { type: "uia_invoke", nodeId: "../node" },
    { type: "uia_set_value", nodeId: "node", value: "x".repeat(4097) },
    { type: "uia_scroll", nodeId: "node", axis: "vertical", amount: 1 },
    { type: "uia_expand_collapse", nodeId: "node", state: "toggle" },
    { type: "uia_set_focus", nodeId: "node" },
  ])("rejects unsupported or ambiguous UIA input %j", action => expect(() => parseComputerAction(action)).toThrow());
  it("preserves legacy nodes and rejects actionable password nodes", () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const node = { id: "node", parentId: null, name: "", automationId: "", controlType: "Edit", enabled: true, password: false, bounds };
    const frame = { observationId: "frame", capturedAt: new Date().toISOString(), uiaCapturedAt: new Date().toISOString(), screenBounds: bounds, width: 100, height: 100, dpi: 96, durationMs: 1, truncated: false, texts: [], nodes: [node] };
    expect(parseComputerObservation(frame).nodes[0]).not.toHaveProperty("supportedActions");
    expect(parseComputerObservation({ ...frame, nodes: [{ ...node, supportedActions: ["uia_set_value"] }] }).nodes[0]?.supportedActions).toEqual(["uia_set_value"]);
    for (const extra of [{ password: true }, { enabled: false }])
      expect(() => parseComputerObservation({ ...frame, nodes: [{ ...node, ...extra, supportedActions: ["uia_set_value"] }] })).toThrow();
  });
});
