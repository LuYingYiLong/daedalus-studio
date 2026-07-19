import type { TimelineBodyPart } from "@/api/types";
import { Icon } from "@/assets/icons";
import { Collapse } from "antd";
import { useEffect, useState } from "react";
import MarkdownContent from "../markdown/MarkdownContent";
import styles from "./ThinkingPart.module.css";

export type TimelineThinkingPart = Extract<TimelineBodyPart, { type: "thinking" }>;

export type ThinkingPartProps = {
	part: TimelineThinkingPart;
};

const ACTIVE_THINKING_LABELS: readonly string[] = ["Thinking", "Thinking.", "Thinking..", "Thinking..."];

function normalizeActiveKeys(nextKeys: string | string[]): string[] {
	return Array.isArray(nextKeys) ? nextKeys : [nextKeys];
}

function ThinkingPart({ part }: ThinkingPartProps): React.JSX.Element | null {
	const [activeKeys, setActiveKeys] = useState<string[]>(() => part.done ? [] : ["thinking"]);
	const [labelIndex, setLabelIndex] = useState<number>(0);

	useEffect((): void => {
		if (part.done) {
			setActiveKeys([]);
		}
	}, [part.done]);

	useEffect((): (() => void) | undefined => {
		if (part.done) {
			setLabelIndex(0);
			return undefined;
		}

		const intervalId: number = window.setInterval((): void => {
			setLabelIndex((currentIndex: number): number => (currentIndex + 1) % ACTIVE_THINKING_LABELS.length);
		}, 500);
		return (): void => {
			window.clearInterval(intervalId);
		};
	}, [part.done]);

	if (part.done && part.text.trim().length === 0) {
		return null;
	}

	return (
		<Collapse
			size="small"
			bordered={false}
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
					label: part.done ? "Thinking" : ACTIVE_THINKING_LABELS[labelIndex],
					children: (
						<div className="markdown-body" style={{userSelect: "text"}}>
							{part.text.trim().length === 0 ? null : (
								<MarkdownContent>{part.text}</MarkdownContent>
							)}
						</div>
					)
				}
			]}
		/>
	);
}

export default ThinkingPart;
