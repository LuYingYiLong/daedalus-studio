import { describe, expect, it, vi } from "vitest";
import {
	createNativeBridgeRequest,
	NATIVE_BRIDGE_MESSAGE_LIMIT,
	requestNativeBridge,
} from "@/remote/native-bridge";
import { createModeItems } from "@/widgets/composer/composer-menu-items";

const translate = ((key: string): string => key) as never;

describe("Android Remote native bridge", () => {
	it("encodes an allowlisted request with an explicit request id", () => {
		expect(JSON.parse(createNativeBridgeRequest(
			"request-1",
			"profiles.connect",
			{ profileId: "profile-1" },
		))).toEqual({
			id: "request-1",
			method: "profiles.connect",
			params: { profileId: "profile-1" },
		});
	});

	it("measures the 16 KiB limit in UTF-8 bytes", () => {
		expect(() => createNativeBridgeRequest(
			"request-large",
			"profiles.rename",
			{ name: "你".repeat(NATIVE_BRIDGE_MESSAGE_LIMIT) },
		)).toThrow("native_bridge_message_too_large");
	});

	it("receives replies when Android injects the bridge without an onmessage property", async () => {
		const schedule = globalThis.setTimeout.bind(globalThis);
		const cancel = globalThis.clearTimeout.bind(globalThis);
		const bridge: NonNullable<Window["DaedalusNative"]> = {
			postMessage(message: string): void {
				const request = JSON.parse(message) as { id: string };
				queueMicrotask((): void => {
					bridge.onmessage?.({
						data: JSON.stringify({ id: request.id, result: { ok: true } }),
					} as MessageEvent<string>);
				});
			},
		};
		vi.stubGlobal("window", {
			DaedalusNative: bridge,
			setTimeout: schedule,
			clearTimeout: cancel,
		});

		try {
			await expect(requestNativeBridge<{ ok: boolean }>("app.info", {}, 100))
				.resolves.toEqual({ ok: true });
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("projects the shared Composer mode menu to Remote capabilities", () => {
		const items = createModeItems(translate, ["ask", "agent", "plan"]) ?? [];
		const keys = items.flatMap((item): string[] => (
			item !== null && typeof item === "object" && "key" in item
				? [String(item.key)]
				: []
		));
		expect(keys).toEqual(["ask", "agent", "plan"]);
		expect(keys).not.toContain("goal");
	});
});
