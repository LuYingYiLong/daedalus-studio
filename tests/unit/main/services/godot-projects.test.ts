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
	isGodotProcessName,
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
			"res://addons/godot_daedalus/plugin.cfg",
			true
		);
		expect(enabled).toContain('"res://addons/gut/plugin.cfg"');
		expect(enabled).toContain('"res://addons/godot_daedalus/plugin.cfg"');
		expect(enabled).toContain("[rendering]");

		const disabled = updateEditorPluginEnabled(
			enabled,
			"res://addons/godot_daedalus/plugin.cfg",
			false
		);
		expect(disabled).toContain('"res://addons/gut/plugin.cfg"');
		expect(disabled).not.toContain('"res://addons/godot_daedalus/plugin.cfg"');
	});

	it("adds an editor_plugins section when the project has none", () => {
		const updated = updateEditorPluginEnabled(
			'[application]\nconfig/name="Demo"\n',
			"res://addons/godot_daedalus/plugin.cfg",
			true
		);
		expect(updated).toContain("[editor_plugins]");
		expect(updated).toContain('PackedStringArray("res://addons/godot_daedalus/plugin.cfg")');
	});

	it("rejects archive paths that can escape the staging directory", () => {
		expect(() => inspectZipEntries(
			createCentralDirectoryOnlyZip("../outside.txt")
		)).toThrow(/unsafe path/u);
		expect(() => inspectZipEntries(
			createCentralDirectoryOnlyZip("C:/outside.txt")
		)).toThrow(/unsafe path/u);
	});

	it("recognizes Godot editor process names without treating unrelated processes as Godot", () => {
		expect(isGodotProcessName("Godot_v4.4-stable_win64.exe")).toBe(true);
		expect(isGodotProcessName("Godot.exe")).toBe(true);
		expect(isGodotProcessName("godot4.exe")).toBe(true);
		expect(isGodotProcessName("godot-helper.exe")).toBe(true);
		expect(isGodotProcessName("notgodot.exe")).toBe(false);
		expect(isGodotProcessName("godotized.exe")).toBe(false);
	});

	it("blocks plugin installation below Godot 4.7 and when the project version is unknown", () => {
		expect(getGodotVersionCompatibilityError("4.7", "4.7.0")).toBeNull();
		expect(getGodotVersionCompatibilityError("4.7.1", "4.7.0")).toBeNull();
		expect(getGodotVersionCompatibilityError("4.6.1", "4.7.0")).toContain("targets Godot 4.6.1");
		expect(getGodotVersionCompatibilityError(null, "4.7.0")).toContain("Cannot determine");
	});

	it("recognizes the local Godot-Daedalus source project in development", () => {
		expect(isDevelopmentPluginSourceProject(
			"C:\\repo-parent\\godot_projects\\godot-daedalus",
			"C:\\repo-parent\\daedalus-studio",
			undefined
		)).toBe(true);
		expect(isDevelopmentPluginSourceProject(
			"C:\\projects\\custom-daedalus",
			"C:\\repo-parent\\daedalus-studio",
			"C:\\projects\\custom-daedalus\\addons\\godot_daedalus"
		)).toBe(true);
		expect(isDevelopmentPluginSourceProject(
			"C:\\repo-parent\\godot_projects\\godot-daedalus",
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
			"addons/godot_daedalus/assets/icons/add.svg.import"
		)).toBe(true);
		expect(isGodotManagedPluginFile(
			"addons/godot_daedalus/scripts/main.gd"
		)).toBe(false);
		expect(isGodotManagedPluginFile(
			"addons/other_plugin/icon.svg.import"
		)).toBe(false);
	});
});
