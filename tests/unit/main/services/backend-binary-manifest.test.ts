import { describe, expect, it } from "vitest";
import {
	assertBackendManifestCompatible,
	compareSemanticVersions,
	parseBackendPayloadManifest,
	parseBackendReleaseManifest,
	payloadManifestsMatch,
	type BackendPayloadManifestV1
} from "@main/services/backend-binary-manifest";

function createPayloadManifest(
	patch: Partial<BackendPayloadManifestV1> = {}
): BackendPayloadManifestV1 {
	return {
		schemaVersion: 1,
		version: "1.1.2",
		buildId: "1.1.2-build",
		platform: "win32",
		arch: "x64",
		nodeVersion: "24.18.0",
		protocolVersion: 2,
		minPluginProtocolVersion: 1,
		maxPluginProtocolVersion: 1,
		minStudioVersion: "1.0.1",
		publishedAt: "2026-07-24T12:00:00.000Z",
		authenticode: "unsigned",
		executable: {
			fileName: "daedalus-backend.exe",
			size: 1024,
			sha256: "a".repeat(64)
		},
		...patch
	};
}

describe("backend binary manifest", () => {
	it("parses payload and release manifests with fixed platform assets", () => {
		const payload = createPayloadManifest();
		expect(parseBackendPayloadManifest(payload)).toEqual(payload);
		expect(parseBackendReleaseManifest({
			...payload,
			archive: {
				fileName: "daedalus-backend-win32-x64.zip",
				size: 512,
				sha256: "b".repeat(64)
			},
			payloadManifestSha256: "c".repeat(64)
		})).toMatchObject({
			version: "1.1.2",
			platform: "win32",
			arch: "x64"
		});
	});

	it("rejects path-shaped asset names and invalid hashes", () => {
		expect(() => parseBackendPayloadManifest({
			...createPayloadManifest(),
			executable: {
				fileName: "../daedalus-backend.exe",
				size: 1024,
				sha256: "a".repeat(64)
			}
		})).toThrow(/fileName/u);
		expect(() => parseBackendPayloadManifest({
			...createPayloadManifest(),
			executable: {
				fileName: "daedalus-backend.exe",
				size: 1024,
				sha256: "not-a-hash"
			}
		})).toThrow(/SHA-256/u);
	});

	it("enforces Studio and protocol compatibility", () => {
		expect(() => assertBackendManifestCompatible(createPayloadManifest(), "1.0.1")).not.toThrow();
		expect(() => assertBackendManifestCompatible(
			createPayloadManifest({ minStudioVersion: "1.1.0" }),
			"1.0.1"
		)).toThrow(/requires Daedalus Studio/u);
		expect(() => assertBackendManifestCompatible(
			createPayloadManifest({ protocolVersion: 3 }),
			"1.1.0"
		)).toThrow(/protocol/u);
		expect(() => assertBackendManifestCompatible(
			createPayloadManifest({
				minPluginProtocolVersion: 2,
				maxPluginProtocolVersion: 2
			}),
			"1.1.0"
		)).toThrow(/Godot plugin protocol/u);
	});

	it("compares versions and detects payload identity drift", () => {
		expect(compareSemanticVersions("1.1.2", "1.1.1")).toBe(1);
		expect(compareSemanticVersions("1.1.2", "1.1.2")).toBe(0);
		expect(payloadManifestsMatch(
			createPayloadManifest(),
			createPayloadManifest({ buildId: "different" })
		)).toBe(false);
	});
});
