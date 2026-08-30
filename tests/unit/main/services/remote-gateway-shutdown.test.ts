import { once } from "node:events";
import { connect, type Socket } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createRemoteCertificateBundle } from "@main/services/remote-certificate";
import { RemoteGateway } from "@main/services/remote-gateway";

const gateways: RemoteGateway[] = [];
const clients: Socket[] = [];
afterEach(async () => {
	for (const client of clients.splice(0)) client.destroy();
	await Promise.all(gateways.splice(0).map((gateway) => gateway.stop()));
});

async function fixture(): Promise<RemoteGateway> {
	const bundle = await createRemoteCertificateBundle(["192.168.1.2"]);
	const gateway = new RemoteGateway({
		addresses: ["127.0.0.1"], httpsPort: 0, bootstrapPort: 0,
		serverCertificatePem: bundle.server.certificatePem, serverPrivateKeyPem: bundle.server.privateKeyPem,
		caCertificatePem: bundle.ca.certificatePem, certificateFingerprint: bundle.fingerprint,
		studioVersion: "test", assetsDirectory: ".", getBackendConnectionInfo: async () => ({ port: 1, authProtocol: null }),
		authenticate: async () => null, pair: async () => null, onDeviceSeen: () => {},
	});
	gateways.push(gateway);
	return gateway;
}
describe("RemoteGateway shutdown with real loopback sockets", () => {
	it("releases HTTPS and bootstrap ports even with incomplete TLS and HTTP connections", async () => {
		const gateway = await fixture();
		await gateway.start();
		await gateway.beginBootstrap(Date.now() + 60_000);
		const state = gateway as unknown as { httpsServers: Server[]; bootstrapServers: Server[] };
		const listeners = [...state.httpsServers, ...state.bootstrapServers];
		const ports = listeners.map((server) => (server.address() as { port: number }).port);
		const closed: Promise<unknown>[] = [];
		for (const port of ports) {
			const client = connect(port, "127.0.0.1"); clients.push(client);
			client.on("error", () => {});
			await once(client, "connect");
			closed.push(once(client, "close"));
		}
		const began = Date.now();
		await gateway.stop();
		await Promise.all(closed);
		expect(Date.now() - began).toBeLessThan(3_000);
		for (const listener of listeners) expect(listener.listening).toBe(false);
	});

	it("does not leave a late listener behind if stop races with start", async () => {
		const gateway = await fixture();
		const started = expect(gateway.start()).rejects.toThrow("remote_gateway_stopped");
		await gateway.stop();
		await started;
		await expect(gateway.start()).rejects.toThrow("remote_gateway_stopped");
		await expect(gateway.beginBootstrap(Date.now() + 1000)).rejects.toThrow("remote_gateway_stopped");
	});
});
