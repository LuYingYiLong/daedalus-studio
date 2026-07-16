import type { AddMcpServerParams, McpTransport } from "@/api/mcp-api";

export type McpServerFormValues = {
	name?: string | undefined;
	description?: string | undefined;
	transport?: McpTransport | undefined;
	command?: string | undefined;
	args?: string | undefined;
	env?: string | undefined;
	url?: string | undefined;
	headers?: string | undefined;
};

export function createMcpServerAddPayload(values: McpServerFormValues): AddMcpServerParams {
	const name: string = getRequiredText(values.name, "Name is required");
	const description: string | undefined = getOptionalText(values.description);
	const transport: McpTransport = values.transport ?? "stdio";
	if (transport === "stdio") {
		return {
			name,
			description,
			transport,
			command: getRequiredText(values.command, "Command is required"),
			args: parseLineList(values.args),
			env: parseEnvLines(values.env)
		};
	}

	return {
		name,
		description,
		transport,
		url: getRequiredText(values.url, "URL is required"),
		headers: parseHeaderLines(values.headers)
	};
}

export function parseLineList(value: string | undefined): string[] {
	return (value ?? "")
		.split(/\r?\n/u)
		.map((line: string): string => line.trim())
		.filter((line: string): boolean => line.length > 0);
}

function getRequiredText(value: string | undefined, message: string): string {
	const trimmed: string = value?.trim() ?? "";
	if (trimmed.length === 0) {
		throw new Error(message);
	}
	return trimmed;
}

function getOptionalText(value: string | undefined): string | undefined {
	const trimmed: string = value?.trim() ?? "";
	return trimmed.length > 0 ? trimmed : undefined;
}

export function parseEnvLines(value: string | undefined): Record<string, string> {
	return parseKeyValueLines(value, "=", "env");
}

export function parseHeaderLines(value: string | undefined): Record<string, string> {
	return parseKeyValueLines(value, ":", "header");
}

function parseKeyValueLines(value: string | undefined, separator: "=" | ":", label: string): Record<string, string> {
	const result: Record<string, string> = {};
	const lines: string[] = parseLineList(value);
	for (const line of lines) {
		const separatorIndex: number = line.indexOf(separator);
		if (separatorIndex <= 0) {
			throw new Error(`Invalid ${label} entry: ${line}`);
		}
		const key: string = line.slice(0, separatorIndex).trim();
		const entryValue: string = line.slice(separatorIndex + 1).trim();
		if (key.length === 0 || entryValue.length === 0) {
			throw new Error(`Invalid ${label} entry: ${line}`);
		}
		result[key] = entryValue;
	}
	return result;
}
