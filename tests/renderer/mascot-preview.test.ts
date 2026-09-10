import { expect, test } from "vitest";
import { applyMascotPreview, getMascotPreview, subscribeMascotPreview } from "../../src/renderer/src/domain/session/mascot-preview";

test("mascot previews are isolated by session and auto clears the override", () => {
	let notifications = 0;
	const unsubscribe = subscribeMascotPreview(() => { notifications += 1; });
	applyMascotPreview({ requestId: "r1", sessionId: "mascot-a", status: "thinking" }, "r1");
	expect(getMascotPreview("mascot-a")).toBe("thinking");
	expect(getMascotPreview("mascot-b")).toBeNull();
	applyMascotPreview({ requestId: "r2", sessionId: "mascot-a", status: "idle" }, "r2");
	expect(getMascotPreview("mascot-a")).toBe("idle");
	applyMascotPreview({ requestId: "r3", sessionId: "mascot-a", status: "auto" }, "r3");
	expect(getMascotPreview("mascot-a")).toBeNull();
	expect(notifications).toBe(3);
	unsubscribe();
});

test("invalid or mismatched preview responses cannot mutate mascot state", () => {
	for (const preview of [null, {}, { requestId: "wrong", sessionId: "invalid", status: "thinking" },
		{ requestId: "r", sessionId: "invalid", status: ["thinking"] },
		{ requestId: "r", sessionId: "invalid", status: "working" },
		{ requestId: "r", sessionId: "", status: "idle" }]) {
		expect(() => applyMascotPreview(preview, "r")).toThrow("Invalid mascot preview");
	}
	expect(getMascotPreview("invalid")).toBeNull();
});

test("executing preview can switch back to the live state", () => {
	applyMascotPreview({ requestId: "execution", sessionId: "mascot-execution", status: "executing" }, "execution");
	expect(getMascotPreview("mascot-execution")).toBe("executing");
	applyMascotPreview({ requestId: "reset", sessionId: "mascot-execution", status: "auto" }, "reset");
	expect(getMascotPreview("mascot-execution")).toBeNull();
});


test("approval and completion previews remain isolated and resettable", () => {
	for (const status of ["awaiting_approval", "completed"] as const) {
		applyMascotPreview({ requestId: status, sessionId: status, status }, status);
		expect(getMascotPreview(status)).toBe(status);
		applyMascotPreview({ requestId: "reset", sessionId: status, status: "auto" }, "reset");
		expect(getMascotPreview(status)).toBeNull();
	}
});
