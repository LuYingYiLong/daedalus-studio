import { describe, expect, it } from "vitest";
import {
	getPathBasename,
	isGodotScenePath,
	isWorkspaceLaunchTargetId,
} from "@/widgets/home/home-layout-model";

describe("home layout model", () => {
	it("recognizes supported launch targets and Godot scene files", () => {
		expect(isWorkspaceLaunchTargetId("godot")).toBe(true);
		expect(isWorkspaceLaunchTargetId("unknown")).toBe(false);
		expect(isGodotScenePath("Scenes/Main.TSCN")).toBe(true);
		expect(isGodotScenePath("README.md")).toBe(false);
	});

	it("normalizes Windows and POSIX path basenames", () => {
		expect(getPathBasename("C:\\workspace\\project.godot")).toBe("project.godot");
		expect(getPathBasename("/workspace/project.godot")).toBe("project.godot");
	});
});
