import { createBackendClient } from "./backend-client";

export type SkillSource = "builtin" | "personal" | "project";

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
