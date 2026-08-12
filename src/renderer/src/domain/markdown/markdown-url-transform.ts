import { defaultUrlTransform, type UrlTransform } from "react-markdown";
import { parseMarkdownResourceHref } from "./markdown-resource-path";

/**
 * react-markdown sanitizes URLs before custom link components receive them.
 * Preserve only validated local file hrefs; all other URLs keep the library's
 * default protocol filtering.
 */
export const transformMarkdownUrl: UrlTransform = (url, key, node): string | null | undefined => {
	if (key === "href" && node.tagName === "a" && parseMarkdownResourceHref(url) !== null) {
		return url;
	}

	return defaultUrlTransform(url);
};
