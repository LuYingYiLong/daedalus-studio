import { afterEach, describe, expect, it } from "vitest";
import { X509Certificate } from "node:crypto";
import {
	createRemoteCertificateBundle,
	shouldRenewRemoteServerCertificate,
} from "@main/services/remote-certificate";

describe("remote certificate", () => {
	afterEach((): void => {
		// Certificate generation changes the x509 package's process-wide crypto provider only.
	});

	it("creates a CA-signed RSA certificate with private IP SANs", async () => {
		const bundle = await createRemoteCertificateBundle(["192.168.1.25", "10.0.0.8"]);
		const root = new X509Certificate(bundle.ca.certificatePem);
		const server = new X509Certificate(bundle.server.certificatePem);
		expect(root.ca).toBe(true);
		expect(server.subjectAltName).toContain("IP Address:192.168.1.25");
		expect(server.subjectAltName).toContain("IP Address:10.0.0.8");
		expect(server.verify(root.publicKey)).toBe(true);
		expect(bundle.ca.privateKeyPem).toContain("PRIVATE KEY");
		expect(bundle.fingerprint).toMatch(/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/u);
	}, 15_000);

	it("renews when addresses change or expiry approaches", () => {
		const farFuture: string = new Date(Date.now() + 90 * 86_400_000).toISOString();
		const nearFuture: string = new Date(Date.now() + 10 * 86_400_000).toISOString();
		expect(shouldRenewRemoteServerCertificate(["192.168.1.2"], farFuture, ["192.168.1.2"])).toBe(false);
		expect(shouldRenewRemoteServerCertificate(["192.168.1.2"], farFuture, ["192.168.1.3"])).toBe(true);
		expect(shouldRenewRemoteServerCertificate(["192.168.1.2"], nearFuture, ["192.168.1.2"])).toBe(true);
	});
});
