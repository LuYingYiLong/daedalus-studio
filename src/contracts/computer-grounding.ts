import {
  COMPUTER_UIA_ACTIONS,
  computerGeneration,
  computerId,
  computerObject,
  parseComputerObservation,
  type ComputerObservation,
  type ComputerUiaAction,
} from "./computer-observation";

export const COMPUTER_GROUNDING_MAX_BYTES = 16 * 1024;
export const COMPUTER_GROUNDINGS_PER_FRAME = 10;
export type ComputerGroundingBox = { x: number; y: number; width: number; height: number };
export type ComputerGroundingCandidate = {
  description: string;
  box: ComputerGroundingBox;
} & (
  | { status: "matched"; nodeId: string; supportedActions: ComputerUiaAction[] }
  | { status: "ambiguous" | "visual_only"; nodeId?: never; supportedActions?: never }
);
export type ComputerGroundingResult = {
  groundingId: string;
  observationId: string;
  generation: number;
  target: string;
  uiaAction: ComputerUiaAction;
  coordinateSpace: "image_pixels";
  status: "matched" | "ambiguous" | "visual_only" | "not_found";
  candidates: ComputerGroundingCandidate[];
  provider: string;
  model: string;
  durationMs: number;
  untrustedEvidence: true;
};
export type ComputerGroundingPreparation = {
  observation: ComputerObservation & { dataUrl: string };
  generation: number;
};
export type ComputerGroundingValidation = {
  observationId: string;
  generation: number;
  valid: true;
};

function boundedText(value: unknown, min: number, max: number): void {
  if (typeof value !== "string" || value.length < min || value.length > max)
    throw new Error("computer_invalid_request");
}
function finiteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function uiaAction(value: unknown): void {
  if (!(COMPUTER_UIA_ACTIONS as readonly unknown[]).includes(value))
    throw new Error("computer_invalid_request");
}

/** 独立校验 Backend 证据；匹配结果不能携带原始输入或屏幕坐标 */
export function parseComputerGroundingResult(value: unknown): ComputerGroundingResult {
  const v = computerObject(value, [
    "groundingId", "observationId", "generation", "target", "uiaAction",
    "coordinateSpace", "status", "candidates", "provider", "model", "durationMs", "untrustedEvidence",
  ]);
  computerId(v.groundingId);
  computerId(v.observationId);
  computerGeneration(v.generation);
  boundedText(v.target, 0, 2000);
  boundedText(v.provider, 1, 200);
  boundedText(v.model, 1, 300);
  uiaAction(v.uiaAction);
  if (v.coordinateSpace !== "image_pixels" || v.untrustedEvidence !== true ||
    !finiteNonnegative(v.durationMs) || !Array.isArray(v.candidates) || v.candidates.length > 5)
    throw new Error("computer_invalid_request");
  for (const item of v.candidates) {
    const candidate = computerObject(item, ["description", "box", "status", "nodeId", "supportedActions"]);
    boundedText(candidate.description, 0, 1000);
    const box = computerObject(candidate.box, ["x", "y", "width", "height"]);
    if (!finiteNonnegative(box.x) || !finiteNonnegative(box.y) ||
      !finiteNonnegative(box.width) || box.width === 0 || !finiteNonnegative(box.height) || box.height === 0)
      throw new Error("computer_invalid_request");
    if (candidate.status === "matched") {
      computerId(candidate.nodeId);
      if (!Array.isArray(candidate.supportedActions) || candidate.supportedActions.length === 0 || candidate.supportedActions.length > 6)
        throw new Error("computer_invalid_request");
      candidate.supportedActions.forEach(uiaAction);
    } else if ((candidate.status !== "ambiguous" && candidate.status !== "visual_only") ||
      candidate.nodeId !== undefined || candidate.supportedActions !== undefined) {
      throw new Error("computer_invalid_request");
    }
  }
  const expectedStatus = v.candidates.length === 0 ? "not_found"
    : v.candidates.length > 1 ? "ambiguous" : v.candidates[0].status;
  if (v.status !== expectedStatus) throw new Error("computer_invalid_request");
  return v as ComputerGroundingResult;
}

export function parseComputerGroundingPreparation(value: unknown): ComputerGroundingPreparation {
  const v = computerObject(value, ["observation", "generation"]);
  computerGeneration(v.generation);
  const observation = parseComputerObservation(v.observation);
  if (!observation.dataUrl) throw new Error("computer_image_invalid");
  return v as ComputerGroundingPreparation;
}

export function parseComputerGroundingValidation(value: unknown): ComputerGroundingValidation {
  const v = computerObject(value, ["observationId", "generation", "valid"]);
  computerId(v.observationId);
  computerGeneration(v.generation);
  if (v.valid !== true) throw new Error("computer_invalid_request");
  return v as ComputerGroundingValidation;
}

export function parseComputerGroundings(value: unknown): ComputerGroundingResult[] {
  if (!Array.isArray(value) || value.length > COMPUTER_GROUNDINGS_PER_FRAME)
    throw new Error("computer_invalid_request");
  return value.map(parseComputerGroundingResult);
}
