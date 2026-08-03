import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ProviderReconnectPart", () => {
	const source: string = readRepoFile("src", "renderer", "src", "features", "chat", "ProviderReconnectPart.tsx");

	it("uses one controlled Ant Design collapse row with the wlan icon", () => {
		expect(source).toContain("<Collapse");
		expect(source).toContain("activeKey={open ? [part.reconnectId] : []}");
		expect(source).toContain("destroyOnHidden={true}");
		expect(source).toContain('size="small"');
		expect(source).toContain('<Icon name="wlan" />');
	});

	it("updates one stable reconnect item and stops animation after recovery or failure", () => {
		expect(source).toContain("key: part.reconnectId");
		expect(source).toContain('part.status === "waiting" || part.status === "reconnecting"');
		expect(source).toContain("reconnectPending && streaming");
		expect(source).toContain('part.status === "recovered"');
		expect(source).toContain('part.status === "failed"');
	});
});
