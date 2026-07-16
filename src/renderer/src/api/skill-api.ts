import { createBackendClient } from "./backend-client";

export type SkillSource = "builtin" | "personal" | "project";
export type SkillInstallSource = Exclude<SkillSource, "builtin">;
export type SkillInstallKind = "folder" | "zip";

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
	error?: string;
};

export type SkillListResult = {
	skills: SkillSummary[];
	revision: string;
};

export async function fetchSkills(): Promise<SkillListResult> {
	const client = await createBackendClient();

	return client.request<SkillListResult>("skill.list");
}

export async function reloadSkills(): Promise<SkillListResult> {
	const client = await createBackendClient();

	return client.request<SkillListResult>("skill.reload");
}

export async function setSkillEnabled(ref: string, enabled: boolean): Promise<SkillListResult> {
	const client = await createBackendClient();

	return client.request<SkillListResult>("skill.set_enabled", { ref, enabled });
}

export async function removeSkill(ref: string): Promise<SkillListResult> {
	const client = await createBackendClient();

	return client.request<SkillListResult>("skill.remove", { ref });
}

export async function installSkill(params: { source: SkillInstallSource; kind: SkillInstallKind; path: string }): Promise<SkillListResult> {
	const client = await createBackendClient();

	return client.request<SkillListResult>("skill.install", params);
}
