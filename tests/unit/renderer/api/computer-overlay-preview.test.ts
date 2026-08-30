import { beforeEach, expect, it, vi } from "vitest";
import { sendChatMessage } from "@/platform/rpc/chat-api";

const mock = vi.hoisted(() => ({ request: vi.fn(), preview: vi.fn(), native: true }));
vi.mock("@/platform/rpc/transport/backend-client", () => ({ createBackendClient: async () => ({ requestWithId: mock.request }) }));
vi.mock("@/platform/runtime/platform-runtime", () => ({ getPlatformRuntime: () => ({ system: mock.native ? { computerObservation: { previewOverlay: mock.preview } } : undefined }) }));
const preview = { connectionId: "conn", sessionId: "session", requestId: "request", action: "running" };
beforeEach(() => { vi.clearAllMocks(); mock.native = true; mock.request.mockResolvedValue({ text: "Preview requested", computerOverlayPreview: preview }); });

it("uses only the explicit debug-command response and keeps the normal RPC shape", async () => {
  await sendChatMessage({ requestId: "request", message: "/test-computer-overlay", mode: "ask" });
  expect(mock.preview).toHaveBeenCalledWith(preview);
  expect(mock.request).toHaveBeenCalledWith("request", "ai.chat", expect.objectContaining({ message: "/test-computer-overlay" }));
});

it("ordinary chat and old Backend responses cannot trigger a preview", async () => {
  await sendChatMessage({ requestId: "request", message: "Describe a computer overlay", mode: "ask" });
  mock.request.mockResolvedValueOnce({ text: "Unknown command" });
  await sendChatMessage({ requestId: "request", message: "/test-computer-overlay", mode: "ask" });
  expect(mock.preview).not.toHaveBeenCalled();
});

it("rejects mismatched responses and unavailable platforms", async () => {
  mock.request.mockResolvedValueOnce({ computerOverlayPreview: { ...preview, requestId: "old-request" } });
  await expect(sendChatMessage({ requestId: "request", message: "/test-computer-overlay", mode: "ask" })).rejects.toThrow("computer_invalid_request");
  mock.native = false;
  await expect(sendChatMessage({ requestId: "request", message: "/test-computer-overlay", mode: "ask" })).rejects.toThrow("computer_preview_requires_windows_studio");
  expect(mock.preview).not.toHaveBeenCalled();
});
