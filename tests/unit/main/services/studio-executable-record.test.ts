import { describe, expect, it } from "vitest";
import { createStudioExecutableRecord } from "../../../../src/main/services/studio-executable-record";

describe("studio executable record", (): void => {
	it("publishes the active loopback Backend endpoint for development", (): void => {
		const record = createStudioExecutableRecord({
			version: "1.2.3",
			executablePath: "C:/fixture/electron.exe",
			appPath: "C:/fixture/studio",
			isPackaged: false,
			processId: 4321,
			backendPort: 38181,
			updatedAt: "2026-09-02T00:00:00.000Z"
		});

		expect(record).toMatchObject({
			schemaVersion: 2,
			processId: 4321,
			runtime: {
				mode: "development",
				authentication: "none",
				url: "ws://127.0.0.1:38181"
			}
		});
		expect(record.arguments).toHaveLength(1);
	});

	it("does not publish a reusable authenticated endpoint for packaged Studio", (): void => {
		const record = createStudioExecutableRecord({
			version: "1.2.3",
			executablePath: "C:/fixture/Daedalus Studio.exe",
			appPath: "C:/fixture/resources/app.asar",
			isPackaged: true,
			processId: 4321,
			backendPort: 38180
		});

		expect(record.runtime).toEqual({ mode: "managed", authentication: "managed" });
		expect(record.arguments).toEqual([]);
	});
});
