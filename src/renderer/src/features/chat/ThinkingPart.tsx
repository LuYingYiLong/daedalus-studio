import type { TimelineBodyPart } from "@/api/types";
import { Icon } from "@/assets/icons";
import { Collapse } from "antd";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./ThinkingPart.module.css";

export type TimelineThinkingPart = Extract<TimelineBodyPart, { type: "thinking" }>;

export type ThinkingPartProps = {
	part: TimelineThinkingPart;
};

function normalizeActiveKeys(nextKeys: string | string[]): string[] {
	return Array.isArray(nextKeys) ? nextKeys : [nextKeys];
}

function ThinkingPart({ part }: ThinkingPartProps): React.JSX.Element | null {
	const [activeKeys, setActiveKeys] = useState<string[]>(() => part.done ? [] : ["thinking"]);

	useEffect((): void => {
		if (part.done) {
			setActiveKeys([]);
		}
	}, [part.done]);

	if (part.text.trim().length === 0) {
		return null;
	}

	return (
		<Collapse
			size="small"
			className={styles.thinkingCollapse}
			activeKey={activeKeys}
			onChange={(nextKeys: string | string[]): void => {
				setActiveKeys(normalizeActiveKeys(nextKeys));
			}}
			expandIcon={(): React.ReactNode => (
				<Icon name="thinking" className={styles.thinkingIcon} />
			)}
			items={[
				{
					key: "thinking",
					label: part.done ? "Thinking" : "Thinking...",
					children: (
						<div className="markdown-body">
							<Markdown remarkPlugins={[remarkGfm]}>
								{part.text}
							</Markdown>
						</div>
					)
				}
			]}
		/>
	);
}

export default ThinkingPart;
