import { createServer, type Server } from "node:http";
import { connect, type Socket } from "node:net";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { HttpServerLifetime } from "@main/services/http-server-lifetime";

const resources: Array<{ server: Server; lifetime: HttpServerLifetime; client?: Socket }> = [];
afterEach(() => {
	for (const resource of resources.splice(0)) {
		resource.client?.destroy(); resource.lifetime.forceClose(); resource.server.close();
	}
});

async function fixture(): Promise<{ server: Server; lifetime: HttpServerLifetime; client: Socket }> {
	const server = createServer();
	const lifetime = new HttpServerLifetime(server, 30);
	const resource: { server: Server; lifetime: HttpServerLifetime; client?: Socket } = { server, lifetime };
	resources.push(resource);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const port = (server.address() as { port: number }).port;
	const client = connect(port, "127.0.0.1");
	client.on("error", () => {});
	resource.client = client;
	await once(client, "connect");
	return { server, lifetime, client };
}

describe("bounded HTTP server shutdown", () => {
	it("closes an unfinished request, and repeated close shares the same completion", async () => {
		const { server, lifetime, client } = await fixture();
		const received = once(server, "request");
		client.write("POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\n\r\nx");
		await received;
		const closed = once(client, "close");
		const stopping = lifetime.close();
		expect(lifetime.close()).toBe(stopping);
		await stopping;
		await closed;
		expect(server.listening).toBe(false);
	});

	it("also destroys upgraded sockets not covered by closeAllConnections", async () => {
		const { server, lifetime, client } = await fixture();
		const upgraded = once(server, "upgrade");
		client.write("GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n");
		await upgraded;
		const closed = once(client, "close");
		await lifetime.close();
		await closed;
	});

	it("bounds shutdown while the peer has not even finished HTTP headers", async () => {
		const { lifetime, client } = await fixture();
		client.write("GET / HTTP/1.1\r\n");
		const closed = once(client, "close");
		await lifetime.close();
		await closed;
	});

	it("closes a listener that starts after shutdown", async () => {
		const server = createServer();
		const lifetime = new HttpServerLifetime(server, 30);
		resources.push({ server, lifetime });
		await lifetime.close();
		server.listen(0, "127.0.0.1");
		await once(server, "close");
		expect(server.listening).toBe(false);
	});
});
