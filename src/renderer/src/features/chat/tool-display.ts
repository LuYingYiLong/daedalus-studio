export type ToolDisplayInfo = {
	label: string;
	iconName: string;
	rawName: string;
};

type ToolDisplayTemplate = {
	label: string;
	iconName: string;
	target?: "file" | "folder" | "scene" | "setting" | "query" | "command" | "preset" | "skill" | "node" | "job" | "uid" | "resource";
};

const TOOL_DISPLAY_TEMPLATES: Record<string, ToolDisplayTemplate> = {
	mcp_skills_load: { label: "Load skill", iconName: "skill", target: "skill" },
	mcp_skills_propose_create: { label: "Draft skill", iconName: "skill", target: "skill" },
	mcp_skills_create: { label: "Create skill", iconName: "skill", target: "skill" },
	mcp_image_generate: { label: "Generate image", iconName: "magic", target: "query" },
	mcp_web_search: { label: "Search the web", iconName: "global", target: "query" },

	mcp_workspace_list_files: { label: "Browse workspace files", iconName: "folder-search", target: "folder" },
	mcp_workspace_read_text_file: { label: "Read file", iconName: "file-search", target: "file" },
	mcp_workspace_search_text: { label: "Search workspace text", iconName: "file-search", target: "query" },
	mcp_workspace_propose_create_text_file: { label: "Draft file", iconName: "file-edit", target: "file" },
	mcp_workspace_create_text_file: { label: "Create file", iconName: "file-edit", target: "file" },
	mcp_workspace_propose_overwrite_text_file: { label: "Draft file overwrite", iconName: "file-edit", target: "file" },
	mcp_workspace_overwrite_text_file: { label: "Overwrite file", iconName: "file-edit", target: "file" },
	mcp_workspace_propose_replace_text_in_file: { label: "Draft text replacement", iconName: "file-edit", target: "file" },
	mcp_workspace_replace_text_in_file: { label: "Replace text in file", iconName: "file-edit", target: "file" },
	mcp_workspace_propose_replace_line_in_file: { label: "Draft line replacement", iconName: "file-edit", target: "file" },
	mcp_workspace_replace_line_in_file: { label: "Replace line in file", iconName: "file-edit", target: "file" },
	mcp_workspace_delete_file: { label: "Delete file", iconName: "file-edit", target: "file" },

	mcp_godot_get_runtime_status: { label: "Check Godot runtime", iconName: "status-success" },
	mcp_godot_get_godot_version: { label: "Check Godot version", iconName: "info" },
	mcp_godot_launch_editor: { label: "Launch Godot editor", iconName: "external-link" },
	mcp_godot_run_project: { label: "Run Godot project", iconName: "send" },
	mcp_godot_stop_project: { label: "Stop Godot project", iconName: "stop" },
	mcp_godot_get_debug_output: { label: "Read Godot debug output", iconName: "book" },
	mcp_godot_list_projects: { label: "Browse Godot projects", iconName: "folder-search" },
	mcp_godot_get_uid: { label: "Resolve resource UID", iconName: "file-search", target: "resource" },
	mcp_godot_resave_resource: { label: "Resave resource", iconName: "file-edit", target: "resource" },
	mcp_godot_update_project_uids: { label: "Update project UIDs", iconName: "folder-edit" },
	mcp_godot_save_scene_variant: { label: "Save scene variant", iconName: "file-edit", target: "scene" },
	mcp_godot_load_sprite_texture: { label: "Load sprite texture", iconName: "file-search", target: "resource" },
	mcp_godot_export_mesh_library: { label: "Export mesh library", iconName: "file-edit", target: "resource" },
	mcp_godot_propose_create_scene: { label: "Draft scene", iconName: "folder-edit", target: "scene" },
	mcp_godot_create_scene: { label: "Create scene", iconName: "folder-edit", target: "scene" },
	mcp_godot_propose_add_node_to_scene: { label: "Draft scene node", iconName: "node", target: "scene" },
	mcp_godot_add_node_to_scene: { label: "Add scene node", iconName: "node", target: "scene" },
	mcp_godot_propose_attach_script_to_node: { label: "Draft script attachment", iconName: "script", target: "node" },
	mcp_godot_attach_script_to_node: { label: "Attach script to node", iconName: "script", target: "node" },
	mcp_godot_propose_connect_signal_in_scene: { label: "Draft signal connection", iconName: "node", target: "scene" },
	mcp_godot_connect_signal_in_scene: { label: "Connect scene signal", iconName: "node", target: "scene" },
	mcp_godot_propose_apply_scene_patch: { label: "Draft scene patch", iconName: "folder-edit", target: "scene" },
	mcp_godot_apply_scene_patch: { label: "Apply scene patch", iconName: "folder-edit", target: "scene" },
	mcp_godot_editor_apply_scene_patch: { label: "Patch open scene", iconName: "folder-edit", target: "scene" },

	mcp_godot_get_project_summary: { label: "Read project summary", iconName: "book" },
	mcp_godot_list_project_files: { label: "Browse project files", iconName: "folder-search" },
	mcp_godot_list_scenes: { label: "Browse scenes", iconName: "folder-search" },
	mcp_godot_list_scripts: { label: "Browse scripts", iconName: "folder-search" },
	mcp_godot_read_text_file: { label: "Read file", iconName: "file-search", target: "file" },
	mcp_godot_search_text: { label: "Search project text", iconName: "file-search", target: "query" },
	mcp_godot_get_project_log_config: { label: "Read log settings", iconName: "book" },
	mcp_godot_list_project_logs: { label: "Browse project logs", iconName: "folder-search" },
	mcp_godot_read_project_log: { label: "Read project log", iconName: "file-search", target: "file" },
	mcp_godot_get_project_settings: { label: "Read project settings", iconName: "settings" },
	mcp_godot_get_editor_config_summary: { label: "Read editor config summary", iconName: "book" },
	mcp_godot_get_editor_settings: { label: "Read editor settings", iconName: "settings" },
	mcp_godot_list_editor_config_files: { label: "Browse editor config files", iconName: "folder-search" },
	mcp_godot_read_editor_config_file: { label: "Read editor config", iconName: "file-search", target: "file" },
	mcp_godot_get_editor_project_state: { label: "Read editor project state", iconName: "book" },
	mcp_godot_get_recent_projects: { label: "Browse recent projects", iconName: "folder-search" },
	mcp_godot_propose_set_project_setting: { label: "Draft project setting", iconName: "settings", target: "setting" },
	mcp_godot_set_project_setting: { label: "Set project setting", iconName: "settings", target: "setting" },
	mcp_godot_propose_unset_project_setting: { label: "Draft setting removal", iconName: "settings", target: "setting" },
	mcp_godot_unset_project_setting: { label: "Unset project setting", iconName: "settings", target: "setting" },
	mcp_godot_inspect_scene_tree: { label: "Inspect scene tree", iconName: "folder-search", target: "scene" },
	mcp_godot_validate_scene_script_references: { label: "Validate scene scripts", iconName: "check", target: "scene" },
	mcp_godot_editor_get_context: { label: "Read editor context", iconName: "book" },
	mcp_godot_editor_get_selected_nodes: { label: "Read selected nodes", iconName: "node" },
	mcp_godot_editor_inspect_node: { label: "Inspect editor node", iconName: "node", target: "node" },
	mcp_godot_editor_capture_scene_view: { label: "Capture scene view", iconName: "file-search" },
	mcp_godot_lsp_get_status: { label: "Check language server", iconName: "status-success" },
	mcp_godot_lsp_get_file_diagnostics: { label: "Check file diagnostics", iconName: "file-search", target: "file" },
	mcp_godot_lsp_get_document_symbols: { label: "Read document symbols", iconName: "file-search", target: "file" },
	mcp_godot_lsp_hover: { label: "Inspect symbol hover", iconName: "file-search", target: "file" },
	mcp_godot_lsp_goto_definition: { label: "Find definition", iconName: "file-search", target: "file" },
	mcp_godot_dap_get_status: { label: "Check debugger status", iconName: "status-success" },
	mcp_godot_dap_get_last_error: { label: "Read debugger error", iconName: "warning" },
	mcp_godot_dap_get_stack_trace: { label: "Read stack trace", iconName: "list-check" },
	mcp_godot_dap_get_variables: { label: "Read debugger variables", iconName: "book", target: "job" },
	mcp_godot_propose_create_text_file: { label: "Draft Godot file", iconName: "file-edit", target: "file" },
	mcp_godot_create_text_file: { label: "Create Godot file", iconName: "file-edit", target: "file" },
	mcp_godot_propose_overwrite_text_file: { label: "Draft Godot file overwrite", iconName: "file-edit", target: "file" },
	mcp_godot_overwrite_text_file: { label: "Overwrite Godot file", iconName: "file-edit", target: "file" },
	mcp_godot_propose_replace_text_in_file: { label: "Draft Godot text replacement", iconName: "file-edit", target: "file" },
	mcp_godot_replace_text_in_file: { label: "Replace text in Godot file", iconName: "file-edit", target: "file" },
	mcp_godot_delete_file: { label: "Delete Godot file", iconName: "file-edit", target: "file" },

	mcp_terminal_get_capabilities: { label: "Check terminal capabilities", iconName: "terminal" },
	mcp_terminal_run_command: { label: "Run terminal command", iconName: "terminal", target: "command" },
	mcp_terminal_run_safe_preset: { label: "Run verification command", iconName: "terminal", target: "preset" },
	mcp_terminal_run_godot_scene_script: { label: "Run Godot scene script", iconName: "terminal", target: "scene" },
	mcp_terminal_run_write_preset: { label: "Run write command", iconName: "terminal", target: "preset" },
	mcp_terminal_get_job_status: { label: "Check terminal job", iconName: "terminal", target: "job" },
	mcp_terminal_get_job_tail: { label: "Read terminal output", iconName: "terminal", target: "job" },
	mcp_terminal_cancel_job: { label: "Cancel terminal job", iconName: "stop", target: "job" }
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringValue(record: Record<string, unknown>, key: string): string | undefined {
	const value: unknown = record[key];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getNumberValue(record: Record<string, unknown>, key: string): string | undefined {
	const value: unknown = record[key];
	return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function getToolName(events: Record<string, unknown>[]): string {
	for (const event of events) {
		const toolName: unknown = event.toolName;
		if (typeof toolName === "string" && toolName.length > 0) {
			return toolName;
		}
	}

	return "tool";
}

function getToolArgs(events: Record<string, unknown>[]): Record<string, unknown> {
	for (const event of events) {
		if (isRecord(event.args)) {
			return event.args;
		}
	}

	return {};
}

function truncateTarget(value: string): string {
	const normalized: string = value.replace(/\s+/g, " ").trim();
	if (normalized.length <= 80) {
		return normalized;
	}

	return `${normalized.slice(0, 36)}...${normalized.slice(-32)}`;
}

function firstStringArg(args: Record<string, unknown>, keys: string[]): string | undefined {
	for (const key of keys) {
		const value: string | undefined = getStringValue(args, key);
		if (value !== undefined) {
			return truncateTarget(value);
		}
	}

	return undefined;
}

function getTarget(args: Record<string, unknown>, target: ToolDisplayTemplate["target"]): string | undefined {
	if (target === "file") {
		return firstStringArg(args, ["relativePath", "resourcePath", "path", "filePath", "fileId", "fileName", "scriptPath", "scenePath"]);
	}
	if (target === "folder") {
		return firstStringArg(args, ["relativePath", "path", "rootPath", "directory", "folderPath"]);
	}
	if (target === "scene") {
		return firstStringArg(args, ["scenePath", "resourcePath", "relativePath", "path"]);
	}
	if (target === "setting") {
		return firstStringArg(args, ["key", "setting", "settingKey"]);
	}
	if (target === "query") {
		return firstStringArg(args, ["query", "prompt", "text", "search"]);
	}
	if (target === "command") {
		return firstStringArg(args, ["command", "script", "presetName"]);
	}
	if (target === "preset") {
		return firstStringArg(args, ["presetName", "command", "resourcePath"]);
	}
	if (target === "skill") {
		const scope: string | undefined = getStringValue(args, "scope");
		const slug: string | undefined = getStringValue(args, "slug");
		if (scope !== undefined && slug !== undefined) {
			return `${scope}:${slug}`;
		}
		return firstStringArg(args, ["ref", "slug", "name"]);
	}
	if (target === "node") {
		const nodePath: string | undefined = firstStringArg(args, ["nodePath", "nodeName"]);
		const scriptPath: string | undefined = firstStringArg(args, ["scriptPath"]);
		if (nodePath !== undefined && scriptPath !== undefined) {
			return `${nodePath} -> ${scriptPath}`;
		}
		return nodePath ?? firstStringArg(args, ["scenePath", "resourcePath"]);
	}
	if (target === "job") {
		return firstStringArg(args, ["jobId", "variablesReference"]) ?? getNumberValue(args, "variablesReference");
	}
	if (target === "uid" || target === "resource") {
		return firstStringArg(args, ["uid", "resourceUid", "resourcePath", "path", "relativePath"]);
	}

	return undefined;
}

function humanizeToolName(toolName: string): string {
	return toolName
		.replace(/^mcp_/, "")
		.replace(/_/g, " ")
		.replace(/\b\w/g, (letter: string): string => letter.toUpperCase());
}

function getFallbackIcon(toolName: string): string {
	if (toolName.includes("search") || toolName.includes("read") || toolName.includes("list") || toolName.includes("get")) {
		return toolName.includes("file") || toolName.includes("text") ? "file-search" : "folder-search";
	}
	if (toolName.includes("create") || toolName.includes("write") || toolName.includes("replace") || toolName.includes("delete") || toolName.includes("set")) {
		return toolName.includes("folder") || toolName.includes("scene") ? "folder-edit" : "file-edit";
	}
	if (toolName.includes("terminal") || toolName.includes("command")) {
		return "terminal";
	}
	if (toolName.includes("skill")) {
		return "skill";
	}
	if (toolName.includes("web")) {
		return "global";
	}
	if (toolName.includes("image")) {
		return "magic";
	}

	return "mcp";
}

export function getToolDisplayInfo(events: Record<string, unknown>[]): ToolDisplayInfo {
	const rawName: string = getToolName(events);
	const args: Record<string, unknown> = getToolArgs(events);
	const template: ToolDisplayTemplate | undefined = TOOL_DISPLAY_TEMPLATES[rawName];

	if (template === undefined) {
		return {
			label: humanizeToolName(rawName),
			iconName: getFallbackIcon(rawName),
			rawName
		};
	}

	const target: string | undefined = getTarget(args, template.target);
	return {
		label: target === undefined ? template.label : `${template.label}: ${target}`,
		iconName: template.iconName,
		rawName
	};
}
