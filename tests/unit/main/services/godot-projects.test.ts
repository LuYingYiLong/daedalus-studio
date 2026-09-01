import { describe, expect, it, vi } from "vitest";

vi.mock("electron", (): object => ({
	app: {
		getPath: (): string => "C:\\temp",
		getAppPath: (): string => "C:\\repo",
		getVersion: (): string => "1.0.4",
		isPackaged: false
	},
	BrowserWindow: {
		fromWebContents: (): undefined => undefined
	},
	dialog: {
		showOpenDialog: async (): Promise<{ canceled: true; filePaths: [] }> => ({
			canceled: true,
			filePaths: []
		})
	},
	ipcMain: {
		handle: (): void => {}
	}
}));

import {
	getGodotVersionCompatibilityError,
	inspectZipEntries,
	isDevelopmentPluginSourceProject,
	isGodotManagedPluginFile,
	updateAutoloadSingleton,
	updateDaedalusBridgeEnabled,
	updateEditorPluginEnabled
} from "@main/services/godot-projects";

function createCentralDirectoryOnlyZip(entryName: string): Buffer {
	const name: Buffer = Buffer.from(entryName, "utf8");
	const central: Buffer = Buffer.alloc(46 + name.length);
	central.writeUInt32LE(0x02014b50, 0);
	central.writeUInt16LE(20, 4);
	central.writeUInt16LE(20, 6);
	central.writeUInt16LE(0x0800, 8);
	central.writeUInt16LE(0, 10);
	central.writeUInt16LE(name.length, 28);
	name.copy(central, 46);
	const end: Buffer = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(1, 8);
	end.writeUInt16LE(1, 10);
	end.writeUInt32LE(central.length, 12);
	end.writeUInt32LE(0, 16);
	return Buffer.concat([central, end]);
}

describe("Godot project plugin management", () => {
	it("adds and removes the Daedalus plugin without dropping existing editor plugins", () => {
		const source = [
			"; Engine configuration file.",
			"",
			"[application]",
			'config/name="Demo"',
			"",
			"[editor_plugins]",
			'enabled=PackedStringArray("res://addons/gut/plugin.cfg")',
			"",
			"[rendering]",
			'renderer/rendering_method="gl_compatibility"',
			""
		].join("\n");
		const enabled = updateEditorPluginEnabled(
			source,
			"res://addons/daedalus_bridge/plugin.cfg",
			true
		);
		expect(enabled).toContain('"res://addons/gut/plugin.cfg"');
		expect(enabled).toContain('"res://addons/daedalus_bridge/plugin.cfg"');
		expect(enabled).toContain("[rendering]");

		const disabled = updateEditorPluginEnabled(
			enabled,
			"res://addons/daedalus_bridge/plugin.cfg",
			false
		);
		expect(disabled).toContain('"res://addons/gut/plugin.cfg"');
		expect(disabled).not.toContain('"res://addons/daedalus_bridge/plugin.cfg"');
	});

	it("adds an editor_plugins section when the project has none", () => {
		const updated = updateEditorPluginEnabled(
			'[application]\nconfig/name="Demo"\n',
			"res://addons/daedalus_bridge/plugin.cfg",
			true
		);
		expect(updated).toContain("[editor_plugins]");
		expect(updated).toContain('PackedStringArray("res://addons/daedalus_bridge/plugin.cfg")');
	});

	it("adds, updates, and removes the runtime test autoload without changing other singletons", () => {
		const source = [
			"[application]",
			'config/name="Demo"',
			"",
			"[autoload]",
			'Existing="*res://scripts/existing.gd"',
			"",
			"[rendering]",
			'renderer/rendering_method="gl_compatibility"',
			"",
		].join("\n");
		const enabled = updateAutoloadSingleton(
			source,
			"DaedalusRuntimeTest",
			"res://addons/daedalus_bridge/scripts/runtime/runtime_test_agent.gd",
			true
		);
		expect(enabled).toContain('Existing="*res://scripts/existing.gd"');
		expect(enabled).toContain('DaedalusRuntimeTest="*res://addons/daedalus_bridge/scripts/runtime/runtime_test_agent.gd"');
		expect(enabled).toContain("[rendering]");

		const updated = updateAutoloadSingleton(
			enabled,
			"DaedalusRuntimeTest",
			"res://addons/daedalus_bridge/scripts/runtime/replacement.gd",
			true
		);
		expect(updated).not.toContain("runtime_test_agent.gd");
		expect(updated).toContain("runtime/replacement.gd");

		const disabled = updateAutoloadSingleton(
			updated,
			"DaedalusRuntimeTest",
			"res://addons/daedalus_bridge/scripts/runtime/replacement.gd",
			false
		);
		expect(disabled).toContain('Existing="*res://scripts/existing.gd"');
		expect(disabled).not.toContain("DaedalusRuntimeTest=");
	});

	it("adds an autoload section when the project has none", () => {
		const updated = updateAutoloadSingleton(
			'[application]\r\nconfig/name="Demo"\r\n',
			"DaedalusRuntimeTest",
			"res://addons/daedalus_bridge/scripts/runtime/runtime_test_agent.gd",
			true
		);
		expect(updated).toContain("\r\n[autoload]\r\n");
		expect(updated).toContain('DaedalusRuntimeTest="*res://addons/daedalus_bridge/scripts/runtime/runtime_test_agent.gd"');
	});

	it("does not overwrite a project-owned autoload with the runtime test singleton", () => {
		expect(() => updateDaedalusBridgeEnabled([
			"[autoload]",
			'DaedalusRuntimeTest="*res://scripts/custom_runtime.gd"',
			"",
		].join("\n"), true)).toThrow(/already assigned/u);
	});

	it("rejects archive paths that can escape the staging directory", () => {
		expect(() => inspectZipEntries(
			createCentralDirectoryOnlyZip("../outside.txt")
		)).toThrow(/unsafe path/u);
		expect(() => inspectZipEntries(
			createCentralDirectoryOnlyZip("C:/outside.txt")
		)).toThrow(/unsafe path/u);
	});

	it("accepts all Godot 4.x projects and rejects older or unknown versions", () => {
		expect(getGodotVersionCompatibilityError("4.0", "4.0.0")).toBeNull();
		expect(getGodotVersionCompatibilityError("4.7.1", "4.0.0")).toBeNull();
		expect(getGodotVersionCompatibilityError("3.5.3", "4.0.0")).toContain("targets Godot 3.5.3");
		expect(getGodotVersionCompatibilityError(null, "4.0.0")).toContain("Cannot determine");
	});

	it("recognizes the local Daedalus Bridge source project in development", () => {
		expect(isDevelopmentPluginSourceProject(
			"C:\\repo-parent\\daedalus-bridge",
			"C:\\repo-parent\\daedalus-studio",
			undefined
		)).toBe(true);
		expect(isDevelopmentPluginSourceProject(
			"C:\\projects\\custom-daedalus",
			"C:\\repo-parent\\daedalus-studio",
			"C:\\projects\\custom-daedalus\\addons\\daedalus_bridge"
		)).toBe(true);
		expect(isDevelopmentPluginSourceProject(
			"C:\\repo-parent\\daedalus-bridge",
			"C:\\repo-parent\\daedalus-studio",
			" "
		)).toBe(true);
		expect(isDevelopmentPluginSourceProject(
			"C:\\projects\\game",
			"C:\\repo-parent\\daedalus-studio",
			undefined
		)).toBe(false);
	});

	it("treats Godot import metadata as mutable after installation", () => {
		expect(isGodotManagedPluginFile(
			"addons/daedalus_bridge/status.svg.import"
		)).toBe(true);
		expect(isGodotManagedPluginFile(
			"addons/daedalus_bridge/scripts/bridge_runtime.gd"
		)).toBe(false);
		expect(isGodotManagedPluginFile(
			"addons/other_plugin/icon.svg.import"
		)).toBe(false);
	});
});
