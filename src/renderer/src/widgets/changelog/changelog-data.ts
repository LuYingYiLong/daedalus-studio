import changelogMarkdown from "../../../../../CHANGELOG.md?raw";

export const CHANGELOG_MARKDOWN: string = changelogMarkdown;

const VERSION_HEADING_PATTERN: RegExp = /^##\s+(.+)$/gm;

function normalizeVersion(version: string): string {
	return version.trim().replace(/^v/i, "");
}

export function getReleaseNotesForVersion(version: string | null | undefined): string | null {
	if (version === null || version === undefined || version.trim().length === 0) {
		return null;
	}

	const targetVersion: string = normalizeVersion(version);
	const headings: Array<{ start: number; end: number; title: string }> = [];
	for (const match of CHANGELOG_MARKDOWN.matchAll(VERSION_HEADING_PATTERN)) {
		const start: number = match.index ?? 0;
		const headingText: string = match[1]?.trim() ?? "";
		headings.push({
			start,
			end: start + match[0].length,
			title: headingText
		});
	}

	const exactHeading = headings.find(({ title }): boolean => {
		const versionMatch: RegExpMatchArray | null = title.match(/^\[?v?([^\]]+)\]?/i);
		return versionMatch !== null && normalizeVersion(versionMatch[1] ?? "") === targetVersion;
	});
	if (exactHeading === undefined) {
		return null;
	}

	const nextHeading: { start: number; end: number; title: string } | undefined = headings.find(({ start }): boolean => start > exactHeading.start);
	return CHANGELOG_MARKDOWN.slice(exactHeading.start, nextHeading?.start ?? CHANGELOG_MARKDOWN.length).trim();
}
