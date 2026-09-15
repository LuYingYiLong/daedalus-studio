import { describe, expect, it } from "vitest";
import { readRepoFile } from "../helpers/repo-paths";

describe("Flow home surface", (): void => {
	it("keeps Chat and Flow controlled and routes graph operations through dedicated RPCs", (): void => {
		const sidebar = readRepoFile("src", "renderer", "src", "widgets", "home", "workspace", "HomeWorkspaceSidebar.tsx");
		const surface = readRepoFile("src", "renderer", "src", "widgets", "flow", "HomeFlowSurface.tsx");
		const api = readRepoFile("src", "renderer", "src", "platform", "rpc", "flow-api.ts");
		expect(sidebar).toContain("value={primarySurface}");
		expect(sidebar).toContain("onPrimarySurfaceChange");
		expect(surface).toContain("nodesConnectable={false}");
		expect(surface).toContain("deleteKeyCode={null}");
		expect(api).toContain('"flow.branch.create"');
		expect(api).toContain('"flow.branch.copyToChat"');
	});
});
