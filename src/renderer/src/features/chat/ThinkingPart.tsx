import type { TimelineBodyPart } from "@/api/types";
import { Icon } from "@/assets/icons";
import { Collapse } from "antd";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import MarkdownContent from "../markdown/MarkdownContent";
import styles from "./ThinkingPart.module.css";

export type TimelineThinkingPart = Extract<TimelineBodyPart, { type: "thinking" }>;

export type ThinkingPartProps = {
	part: TimelineThinkingPart;
};

const ACTIVE_THINKING_LABELS: readonly string[] = ["Thinking", "Thinking.", "Thinking..", "Thinking..."];
const THINKING_SCROLL_BOTTOM_THRESHOLD: number = 24;

function normalizeActiveKeys(nextKeys: string | string[]): string[] {
	return Array.isArray(nextKeys) ? nextKeys : [nextKeys];
}

function isNearScrollBottom(element: HTMLElement): boolean {
	return element.scrollHeight - element.scrollTop - element.clientHeight <= THINKING_SCROLL_BOTTOM_THRESHOLD;
}

function scrollToThinkingBottom(element: HTMLElement): void {
	element.scrollTop = element.scrollHeight;
}

function containScrollableWheel(event: React.WheelEvent<HTMLDivElement>): void {
	const element: HTMLDivElement = event.currentTarget;
	const canScroll: boolean = element.scrollHeight > element.clientHeight;

	if (!canScroll) {
		return;
	}

	const scrollingUp: boolean = event.deltaY < 0;
	const scrollingDown: boolean = event.deltaY > 0;
	const atTop: boolean = element.scrollTop <= 0;
	const atBottom: boolean = isNearScrollBottom(element);

	if ((scrollingUp && !atTop) || (scrollingDown && !atBottom)) {
		event.stopPropagation();
	}
}

function ThinkingPart({ part }: ThinkingPartProps): React.JSX.Element | null {
	const contentRef = useRef<HTMLDivElement | null>(null);
	const autoFollowRef = useRef<boolean>(true);
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

	useLayoutEffect((): void => {
		const element: HTMLDivElement | null = contentRef.current;

		if (element === null || !autoFollowRef.current) {
			return;
		}

		window.requestAnimationFrame((): void => {
			const currentElement: HTMLDivElement | null = contentRef.current;
			if (currentElement !== null && autoFollowRef.current) {
				scrollToThinkingBottom(currentElement);
			}
		});
	}, [part.text]);

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
			expandIcon={() => (
				<Icon name="thinking" className={styles.thinkingIcon} />
			)}
			items={[
				{
					key: "thinking",
					label: part.done ? "Thinking" : ACTIVE_THINKING_LABELS[labelIndex],
					children: (
						<div
							ref={contentRef}
							className={`${styles.thinkingContent} markdown-body`}
							onScroll={(event: React.UIEvent<HTMLDivElement>): void => {
								autoFollowRef.current = isNearScrollBottom(event.currentTarget);
							}}
							onWheel={containScrollableWheel}
						>
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
