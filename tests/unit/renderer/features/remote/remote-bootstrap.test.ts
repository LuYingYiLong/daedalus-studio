import { afterEach, describe, expect, it, vi } from "vitest";

type RemoteBootstrapModule = typeof import("@/remote/remote-bootstrap");

function stubBrowserLocation(hash: string): ReturnType<typeof vi.fn> {
	const replaceState = vi.fn();
	vi.stubGlobal("location", {
		hash,
		pathname: "/__app__/native-remote.html",
		search: "",
	});
	vi.stubGlobal("history", {
		state: { startup: true },
		replaceState,
	});
	vi.stubGlobal("navigator", {
		platform: "Linux armv8l",
		userAgent: "Android",
	});
	return replaceState;
}

async function loadRemoteBootstrap(): Promise<RemoteBootstrapModule> {
	return await import("@/remote/remote-bootstrap");
}

afterEach((): void => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("Remote pairing bootstrap", () => {
	it("submits a pairing fragment only once when startup runs concurrently", async () => {
		const replaceState = stubBrowserLocation("#pair=single-use-code");
		const fetchMock = vi.fn(async (): Promise<Response> => new Response(
			JSON.stringify({ paired: true }),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		));
		vi.stubGlobal("fetch", fetchMock);
		const { pairFromLocationFragment } = await loadRemoteBootstrap();

		const first = pairFromLocationFragment();
		const second = pairFromLocationFragment();

		await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(replaceState).toHaveBeenCalledOnce();
		expect(replaceState).toHaveBeenCalledWith(
			{ startup: true },
			"",
			"/__app__/native-remote.html",
		);
	});

	it("accepts an already-consumed code only when the Gateway Cookie is authenticated", async () => {
		stubBrowserLocation("#pair=already-consumed");
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(
				JSON.stringify({ error: "remote_pair_code_invalid" }),
				{ status: 401, headers: { "Content-Type": "application/json" } },
			))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				name: "Daedalus Studio",
				protocolVersion: 3,
				remoteUiCompatibilityVersion: 1,
				studioVersion: "1.1.5",
				pairingRequired: false,
				certificateFingerprint: "AA:BB",
			}), { status: 200, headers: { "Content-Type": "application/json" } }));
		vi.stubGlobal("fetch", fetchMock);
		const { pairFromLocationFragment } = await loadRemoteBootstrap();

		await expect(pairFromLocationFragment()).resolves.toBe(true);
		expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/status", {
			credentials: "include",
			cache: "no-store",
		});
	});

	it("still rejects an invalid code when no authenticated Cookie exists", async () => {
		stubBrowserLocation("#pair=invalid-code");
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(
				JSON.stringify({ error: "remote_pair_code_invalid" }),
				{ status: 401, headers: { "Content-Type": "application/json" } },
			))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				name: "Daedalus Studio",
				protocolVersion: 3,
				remoteUiCompatibilityVersion: 1,
				studioVersion: "1.1.5",
				pairingRequired: true,
				certificateFingerprint: "AA:BB",
			}), { status: 200, headers: { "Content-Type": "application/json" } }));
		vi.stubGlobal("fetch", fetchMock);
		const { pairFromLocationFragment } = await loadRemoteBootstrap();

		await expect(pairFromLocationFragment()).rejects.toThrow("remote_pair_code_invalid");
	});

	it("does nothing when the URL has no pairing fragment", async () => {
		const replaceState = stubBrowserLocation("");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const { pairFromLocationFragment } = await loadRemoteBootstrap();

		await expect(pairFromLocationFragment()).resolves.toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(replaceState).not.toHaveBeenCalled();
	});
});
