import { TimelineAssistantBlock, TimelineBlock } from "@/api/types";
import AssistantBubble from "../bubble/AssistantBubble";
import UserBubble from "../bubble/UserBubble";
import styles from "./MessageList.module.css";
import { formatElapsedTime, formatShortDateTime } from "@/utils/time-format";
import { Spin, Alert } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

export type MessageListProps = {
	blocks: TimelineBlock[];
	isLoading?: boolean;
	errorMessage?: string | null;
	hasMoreBefore?: boolean;
	hasMoreAfter?: boolean;
	onLoadMoreBefore?: () => void;
	onLoadMoreAfter?: () => void;
}

const DEFAULT_USER_HEIGHT: number = 96;
const DEFAULT_ASSISTANT_HEIGHT: number = 180;
const OVERSCAN_BLOCKS: number = 8;

function getAssistantMarkdown(block: TimelineAssistantBlock): string {
		const markdown: string = block.bodyParts
			.filter((part) => part.type === "markdown")
			.map((part) => part.text)
			.join("");
		
		return markdown.length > 0 ? markdown : block.content;
	}

function estimateBlockHeight(block: TimelineBlock): number {
	if (block.renderHints?.estimatedHeight !== undefined) {
		return Math.max(56, block.renderHints.estimatedHeight);
	}

	if (block.type === "user") {
		return Math.max(DEFAULT_USER_HEIGHT, Math.min(260, block.content.length * 0.42));
	}

	const contentChars: number = block.bodyParts.reduce((total: number, part): number => {
		if (part.type === "markdown" || part.type === "thinking") {
			return total + part.text.length;
		}

		return total + 240;
	}, 0);

	return Math.max(DEFAULT_ASSISTANT_HEIGHT, Math.min(720, contentChars * 0.36));
}

function createPrefixHeights(heights: number[]): number[] {
	const prefix: number[] = [0];

	for (const height of heights) {
		prefix.push((prefix[prefix.length - 1] ?? 0) + height);
	}

	return prefix;
}

function findIndexForOffset(prefixHeights: number[], offset: number): number {
	let low: number = 0;
	let high: number = Math.max(0, prefixHeights.length - 1);

	while (low < high) {
		const mid: number = Math.floor((low + high) / 2);
		if ((prefixHeights[mid + 1] ?? 0) < offset) {
			low = mid + 1;
		} else {
			high = mid;
		}
	}

	return low;
}

function MessageList({
	blocks,
	isLoading,
	errorMessage,
	hasMoreBefore = false,
	hasMoreAfter = false,
	onLoadMoreBefore,
	onLoadMoreAfter
}: MessageListProps): React.JSX.Element {
	const listRef = useRef<HTMLElement | null>(null);
	const [nowMs, setNowMs] = useState<number>(() => Date.now());
	const [viewport, setViewport] = useState<{ scrollTop: number; height: number }>({
		scrollTop: 0,
		height: 720
	});
	const hasRunningAssistantBlock: boolean = blocks.some((block: TimelineBlock): boolean => {
		return block.type === "assistant" && block.status === "running";
	});
	const estimatedHeights: number[] = useMemo((): number[] => blocks.map(estimateBlockHeight), [blocks]);
	const prefixHeights: number[] = useMemo((): number[] => createPrefixHeights(estimatedHeights), [estimatedHeights]);
	const totalEstimatedHeight: number = prefixHeights[prefixHeights.length - 1] ?? 0;
	const startIndex: number = Math.max(0, findIndexForOffset(prefixHeights, viewport.scrollTop) - OVERSCAN_BLOCKS);
	const endIndex: number = Math.min(
		blocks.length,
		findIndexForOffset(prefixHeights, viewport.scrollTop + viewport.height) + OVERSCAN_BLOCKS + 1
	);
	const topSpacerHeight: number = prefixHeights[startIndex] ?? 0;
	const bottomSpacerHeight: number = Math.max(0, totalEstimatedHeight - (prefixHeights[endIndex] ?? 0));
	const visibleBlocks: TimelineBlock[] = blocks.slice(startIndex, endIndex);

	useEffect((): void => {
		const element: HTMLElement | null = listRef.current;

		if (element === null) {
			return;
		}

		const distanceFromBottom: number = element.scrollHeight - element.scrollTop - element.clientHeight;
		if (distanceFromBottom > 320 && !hasRunningAssistantBlock) {
			return;
		}

		element.scrollTo({
			top: element.scrollHeight,
			behavior: hasRunningAssistantBlock ? "auto" : "smooth"
		});
	}, [blocks.length, hasRunningAssistantBlock, isLoading, errorMessage]);

	useEffect((): (() => void) | void => {
		const element: HTMLElement | null = listRef.current;

		if (element === null) {
			return;
		}

		function updateViewport(): void {
			if (element === null) {
				return;
			}

			setViewport({
				scrollTop: element.scrollTop,
				height: element.clientHeight
			});

			if (element.scrollTop < 320 && hasMoreBefore) {
				onLoadMoreBefore?.();
			}

			const distanceFromBottom: number = element.scrollHeight - element.scrollTop - element.clientHeight;
			if (distanceFromBottom < 320 && hasMoreAfter) {
				onLoadMoreAfter?.();
			}
		}

		updateViewport();
		element.addEventListener("scroll", updateViewport, { passive: true });
		window.addEventListener("resize", updateViewport);

		return (): void => {
			element.removeEventListener("scroll", updateViewport);
			window.removeEventListener("resize", updateViewport);
		};
	}, [hasMoreAfter, hasMoreBefore, onLoadMoreAfter, onLoadMoreBefore]);

	useEffect((): (() => void) | void => {
		if (!hasRunningAssistantBlock) {
			return;
		}

		setNowMs(Date.now());

		const timerId: number = window.setInterval((): void => {
			setNowMs(Date.now());
		}, 1000);

		return (): void => {
			window.clearInterval(timerId);
		};
	}, [hasRunningAssistantBlock]);

	const nowIsoTime: string = new Date(nowMs).toISOString();

	return (
		<section ref={listRef} className={styles.messageList}>
			{errorMessage ? (
				<Alert description={errorMessage} type="error" showIcon={true} />
			) : null}
			{isLoading ? (
				<Spin className={styles.loadingIcon} />
			) : (
				<>
					<div style={{ height: topSpacerHeight }} />
					{visibleBlocks.map((block) => {
					if (block.type === "user") {
						return <UserBubble
							key={block.id}
							message={block.content}
							sentTime={formatShortDateTime(block.sentAtUtc)}
						/>
					}

					return (
						<AssistantBubble
							key={block.id}
							bodyParts={block.bodyParts}
							message={getAssistantMarkdown(block)}
							elapsedTime={formatElapsedTime(
								block.startedAtUtc,
								block.status === "running" ? nowIsoTime : block.completedAtUtc
							) ?? undefined}
							endTime={block.status === "running" ? undefined : formatShortDateTime(block.completedAtUtc)}
						/>
					);
				})}
					<div style={{ height: bottomSpacerHeight }} />
				</>
			)}
		</section>
	)
}

export default MessageList;
