import { createBackendClient } from "@/platform/rpc/transport/backend-client";

export type SkillSource = "builtin" | "personal" | "project";
export type SkillInstallSource = Exclude<SkillSource, "builtin">;
export type SkillInstallKind = "folder" | "zip";

export type SkillTarget = {
	workspaceId?: string;
	sourceFolderId?: string;
};

export type SkillSummary = {
	ref: string;
	slug: string;
	name: string;
	description: string;
	source: SkillSource;
	enabled: boolean;
	valid: boolean;
	editable: boolean;
	removable: boolean;
	displayPath: string;
	workspaceId?: string;
	sourceFolderId?: string;
	isPrimarySourceFolder?: boolean;
	error?: string;
};

export type SkillListResult = {
	skills: SkillSummary[];
	revision: string;
};

export async function fetchSkills(target: SkillTarget = {}): Promise<SkillListResult> {
	const client = await createBackendClient();

	return client.request<SkillListResult>("skill.list", target);
}

export async function reloadSkills(target: SkillTarget = {}): Promise<SkillListResult> {
	const client = await createBackendClient();

	return client.request<SkillListResult>("skill.reload", target);
}

export async function setSkillEnabled(ref: string, enabled: boolean, target: SkillTarget = {}): Promise<SkillListResult> {
	const client = await createBackendClient();

	return client.request<SkillListResult>("skill.set_enabled", { ref, enabled, ...target });
}

export async function fetchSkillContent(ref: string, target: SkillTarget = {}): Promise<{ ref: string; content: string }> {
	const client = await createBackendClient();

	return client.request<{ ref: string; content: string }>("skill.get", { ref, ...target });
}

export async function updateSkillContent(ref: string, content: string, target: SkillTarget = {}): Promise<SkillListResult> {
	const client = await createBackendClient();

	return client.request<SkillListResult>("skill.update", { ref, content, ...target });
}

export async function removeSkill(ref: string, target: SkillTarget = {}): Promise<SkillListResult> {
	const client = await createBackendClient();

	return client.request<SkillListResult>("skill.remove", { ref, ...target });
}

export async function installSkill(params: { source: SkillInstallSource; kind: SkillInstallKind; path: string } & SkillTarget): Promise<SkillListResult> {
	const client = await createBackendClient();

	return client.request<SkillListResult>("skill.install", params);
}
