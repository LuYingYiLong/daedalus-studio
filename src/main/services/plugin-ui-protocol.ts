import { protocol } from "electron";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { getDaedalusDir } from "./backend-binary-store";

const PLUGIN_UI_SCHEME: string = "plugin-ui";
const MAX_PLUGIN_UI_RESOURCE_BYTES: number = 2 * 1024 * 1024;
const CONTENT_SECURITY_POLICY: string = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'";
let registered: boolean = false;

type PluginUiDeclaration = {
	pluginId: string;
	ui: { kind: "sandbox"; entry: string } | { kind: "schema" };
};

type StoredPlugin = {
	packageRoot: string;
	trust: string;
	enabled: boolean;
	nativePlugin?: { flowNodes?: PluginUiDeclaration[] };
};

function isInside(root: string, candidate: string): boolean {
	const normalizedRoot = resolve(root);
	const normalizedCandidate = resolve(candidate);
	return normalizedCandidate !== normalizedRoot && normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

function contentType(path: string): string {
	switch (extname(path).toLocaleLowerCase()) {
	case ".html": return "text/html; charset=utf-8";
	case ".js": case ".mjs": return "text/javascript; charset=utf-8";
	case ".css": return "text/css; charset=utf-8";
	case ".json": return "application/json; charset=utf-8";
	case ".svg": return "image/svg+xml";
	case ".png": return "image/png";
	case ".jpg": case ".jpeg": return "image/jpeg";
	case ".webp": return "image/webp";
	case ".woff": return "font/woff";
	case ".woff2": return "font/woff2";
	default: return "application/octet-stream";
	}
}

function response(body: BodyInit | null, status: number, mimeType: string = "text/plain; charset=utf-8"): Response {
	return new Response(body, {
		status,
		headers: {
			"Cache-Control": "no-store",
			"Content-Security-Policy": CONTENT_SECURITY_POLICY,
			"Content-Type": mimeType,
			"Cross-Origin-Resource-Policy": "same-origin",
			"X-Content-Type-Options": "nosniff",
		},
	});
}

async function readStoredPlugins(): Promise<StoredPlugin[]> {
	try {
		const path = resolve(getDaedalusDir(), "plugins", "records.json");
		const info = await stat(path);
		if (!info.isFile() || info.size > 4 * 1024 * 1024) return [];
		const value = JSON.parse(await readFile(path, "utf8")) as { plugins?: unknown };
		return Array.isArray(value.plugins) ? value.plugins.filter((plugin): plugin is StoredPlugin => typeof plugin === "object" && plugin !== null && typeof (plugin as StoredPlugin).packageRoot === "string") : [];
	} catch {
		return [];
	}
}

async function handlePluginUiRequest(request: Request): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD") return response("Method not allowed", 405);
	const url = new URL(request.url);
	if (!/^[0-9a-f]+(?:\.[0-9a-f]+)*$/u.test(url.hostname) || url.hostname.length > 512) return response("Not found", 404);
	const encodedPluginId = url.hostname.replaceAll(".", "");
	if (encodedPluginId.length % 2 !== 0) return response("Not found", 404);
	const pluginId = Buffer.from(encodedPluginId, "hex").toString("utf8");
	if (Buffer.from(pluginId, "utf8").toString("hex") !== encodedPluginId) return response("Not found", 404);
	let segments: string[];
	try {
		segments = url.pathname.split("/").filter(Boolean).map((segment): string => decodeURIComponent(segment));
	} catch {
		return response("Invalid path", 400);
	}
	if (pluginId.length === 0 || pluginId.length > 128 || segments.length === 0 || segments.some((segment): boolean => segment === "." || segment === ".." || segment.includes("\\") || segment.includes("\0"))) return response("Invalid path", 400);
	const relativeResource = `./${segments.join("/")}`;
	const candidates = (await readStoredPlugins()).flatMap((plugin): Array<{ plugin: StoredPlugin; declaration: PluginUiDeclaration }> => {
		if (plugin.trust !== "trusted" || plugin.enabled !== true) return [];
		return (plugin.nativePlugin?.flowNodes ?? []).flatMap((declaration): Array<{ plugin: StoredPlugin; declaration: PluginUiDeclaration }> => declaration.pluginId === pluginId && declaration.ui.kind === "sandbox" ? [{ plugin, declaration }] : []);
	}).filter(({ declaration }): boolean => {
		if (declaration.ui.kind !== "sandbox") return false;
		const entry = declaration.ui.entry;
		const entryRoot = dirname(entry).replace(/\\/gu, "/");
		const resource = relativeResource.replace(/\\/gu, "/");
		return resource === entry || resource.startsWith(`${entryRoot}/`);
	});
	const packageRoots = [...new Set(candidates.map(({ plugin }): string => resolve(plugin.packageRoot)))];
	if (packageRoots.length !== 1) return response("Not found", 404);
	try {
		const packagesRoot = await realpath(resolve(getDaedalusDir(), "plugins", "packages"));
		const packageRoot = await realpath(packageRoots[0]!);
		if (!isInside(packagesRoot, packageRoot)) return response("Not found", 404);
		const target = resolve(packageRoot, relativeResource);
		if (!isInside(packageRoot, target)) return response("Not found", 404);
		const realTarget = await realpath(target);
		if (!isInside(packageRoot, realTarget)) return response("Not found", 404);
		const info = await stat(realTarget);
		if (!info.isFile() || info.size > MAX_PLUGIN_UI_RESOURCE_BYTES) return response("Not found", 404);
		const bytes = request.method === "HEAD" ? null : await readFile(realTarget);
		return response(bytes, 200, contentType(realTarget));
	} catch {
		return response("Not found", 404);
	}
}

export function registerPluginUiProtocol(): void {
	if (registered) return;
	protocol.handle(PLUGIN_UI_SCHEME, handlePluginUiRequest);
	registered = true;
}
