export const COMPUTER_PROTOCOL_VERSION = 1;
export const COMPUTER_MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
export type ComputerToolName =
  | "mcp_computer_request_access"
  | "mcp_computer_observe"
  | "mcp_computer_screenshot";
export type ComputerRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ComputerNode = {
  id: string;
  parentId: string | null;
  name: string;
  automationId: string;
  controlType: string;
  bounds: ComputerRect;
  enabled: boolean;
  password: boolean;
};
export type ComputerText = {
  id: string;
  text: string;
  confidence: number;
  bounds: ComputerRect;
};
export type ComputerObservation = {
  observationId: string;
  capturedAt: string;
  uiaCapturedAt: string;
  screenBounds: ComputerRect;
  width: number;
  height: number;
  dpi: number;
  nodes: ComputerNode[];
  texts: ComputerText[];
  truncated: boolean;
  durationMs: number;
  dataUrl?: string;
};
export type ComputerSource = {
  sourceId: string;
  title: string;
  thumbnailDataUrl?: string;
};
export type ComputerScope = {
  connectionId: string;
  sessionId: string;
  requestId: string;
  runId: string;
};
export type ComputerRevocation = ComputerScope & { code: string };
export type ComputerToolRequest = ComputerScope & {
  callId: string;
  toolCallId: string;
  toolName: ComputerToolName;
  args: Record<string, unknown>;
};
export type ComputerConsent = {
  callId: string;
  reason: string;
  sessionId: string;
  expiresAt: number;
};
export type ComputerState = {
  enabled: boolean;
  available: boolean;
  error: string | null;
  pending: ComputerConsent | null;
  sharing: { title: string; sessionId: string; requestId: string } | null;
  observation: ComputerObservation | null;
};
export type ComputerAPI = {
  getState(): Promise<ComputerState>;
  onState(listener: (state: ComputerState) => void): () => void;
  onRevoked(listener: (value: ComputerRevocation) => void): () => void;
  setEnabled(enabled: boolean): Promise<void>;
  setContext(
    context: {
      connectionId: string;
      sessionId: string | null;
      workspaceId: string | null;
    } | null,
  ): Promise<void>;
  execute(request: ComputerToolRequest): Promise<Record<string, unknown>>;
  cancel(callId: string): Promise<void>;
  finish(scope: ComputerScope): Promise<void>;
  list(): Promise<ComputerSource[]>;
  decide(params: { callId: string; sourceId: string | null }): Promise<void>;
  revoke(): Promise<void>;
  diagnose(sourceId: string): Promise<ComputerObservation>;
  listDiagnostics(): Promise<ComputerSource[]>;
  closeDiagnostics(): Promise<void>;
};

const ID = /^[a-zA-Z0-9_-]{1,160}$/;
export function computerId(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value))
    throw new Error("computer_invalid_request");
  return value;
}
export function parseComputerRequest(value: unknown): ComputerToolRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("computer_invalid_request");
  const v = value as Record<string, unknown>;
  const keys = [
    "connectionId",
    "sessionId",
    "requestId",
    "runId",
    "callId",
    "toolCallId",
    "toolName",
    "args",
  ];
  if (
    Object.keys(v).some((k) => !keys.includes(k)) ||
    keys.some((k) => !(k in v))
  )
    throw new Error("computer_invalid_request");
  for (const key of keys.slice(0, 6)) computerId(v[key]);
  if (
    ![
      "mcp_computer_request_access",
      "mcp_computer_observe",
      "mcp_computer_screenshot",
    ].includes(String(v.toolName))
  )
    throw new Error("computer_tool_not_supported");
  if (!v.args || typeof v.args !== "object" || Array.isArray(v.args))
    throw new Error("computer_invalid_request");
  const args = v.args as Record<string, unknown>;
  const allowed =
    v.toolName === "mcp_computer_request_access"
      ? ["reason"]
      : v.toolName === "mcp_computer_screenshot"
        ? ["observationId"]
        : [];
  if (Object.keys(args).some((k) => !allowed.includes(k)))
    throw new Error("computer_invalid_request");
  if (
    v.toolName === "mcp_computer_request_access" &&
    (typeof args.reason !== "string" ||
      !args.reason.trim() ||
      args.reason.length > 2000)
  )
    throw new Error("computer_invalid_request");
  if (v.toolName === "mcp_computer_screenshot") computerId(args.observationId);
  return v as ComputerToolRequest;
}

export function computerObject(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("computer_invalid_request");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key)))
    throw new Error("computer_invalid_request");
  return record;
}

export function parseComputerObservation(value: unknown): ComputerObservation {
  const v = computerObject(value, [
    "observationId",
    "capturedAt",
    "uiaCapturedAt",
    "screenBounds",
    "width",
    "height",
    "dpi",
    "nodes",
    "texts",
    "truncated",
    "durationMs",
    "dataUrl",
  ]);
  computerId(v.observationId);
  const finite = (n: unknown, min: number, max: number): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  const rect = (value: unknown): void => {
    const r = computerObject(value, ["x", "y", "width", "height"]);
    if (
      !finite(r.x, -100000, 100000) ||
      !finite(r.y, -100000, 100000) ||
      !finite(r.width, 0, 100000) ||
      !finite(r.height, 0, 100000)
    )
      throw new Error("computer_protocol_invalid");
  };
  if (
    !finite(v.width, 1, 2560) ||
    !finite(v.height, 1, 2560) ||
    !finite(v.dpi, 1, 2000) ||
    !finite(v.durationMs, 0, 20000) ||
    typeof v.truncated !== "boolean"
  )
    throw new Error("computer_protocol_invalid");
  for (const key of ["capturedAt", "uiaCapturedAt"])
    if (
      typeof v[key] !== "string" ||
      !Number.isFinite(Date.parse(v[key] as string))
    )
      throw new Error("computer_protocol_invalid");
  rect(v.screenBounds);
  if (
    !Array.isArray(v.nodes) ||
    v.nodes.length > 1000 ||
    !Array.isArray(v.texts) ||
    v.texts.length > 500
  )
    throw new Error("computer_protocol_invalid");
  let textBytes = 0;
  const boundedText = (value: unknown): void => {
    if (typeof value !== "string") throw new Error("computer_protocol_invalid");
    textBytes += new TextEncoder().encode(value).length;
  };
  const ids = new Set<string>();
  for (const value of v.nodes) {
    const node = computerObject(value, [
      "id",
      "parentId",
      "name",
      "automationId",
      "controlType",
      "bounds",
      "enabled",
      "password",
    ]);
    const id = computerId(node.id);
    if (ids.has(id)) throw new Error("computer_protocol_invalid");
    ids.add(id);
    if (
      node.parentId !== null &&
      (!ids.has(computerId(node.parentId)) || node.parentId === id)
    )
      throw new Error("computer_protocol_invalid");
    boundedText(node.name);
    boundedText(node.automationId);
    boundedText(node.controlType);
    rect(node.bounds);
    if (
      typeof node.enabled !== "boolean" ||
      typeof node.password !== "boolean" ||
      (node.password && (node.name !== "" || node.automationId !== ""))
    )
      throw new Error("computer_protocol_invalid");
  }
  for (const value of v.texts) {
    const block = computerObject(value, ["id", "text", "confidence", "bounds"]);
    computerId(block.id);
    boundedText(block.text);
    rect(block.bounds);
    if (!finite(block.confidence, 0, 1))
      throw new Error("computer_protocol_invalid");
  }
  if (textBytes > 65536) throw new Error("computer_result_too_large");
  if (
    v.dataUrl !== undefined &&
    (typeof v.dataUrl !== "string" ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.dataUrl) ||
      v.dataUrl.length >
        "data:image/png;base64,".length + Math.ceil((5 * 1024 * 1024) / 3) * 4)
  )
    throw new Error("computer_image_invalid");
  return v as ComputerObservation;
}
