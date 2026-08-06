import type { TimelineBodyPart } from "@/api/types";
import { Icon } from "@/assets/icons";
import ShinyText from "@/components/ShinyText";
import { Collapse } from "antd";
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import MarkdownContent from "../markdown/MarkdownContent";
import styles from "./ThinkingPart.module.css";
import { useTimelineDisclosure } from "./timeline-disclosure-state";

export type TimelineThinkingPart = Extract<TimelineBodyPart, { type: "thinking" }>;

export type ThinkingPartProps = {
	part: TimelineThinkingPart;
	disclosureKey?: string;
};

const THINKING_SCROLL_BOTTOM_THRESHOLD: number = 24;

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

function ThinkingPart({ part, disclosureKey = "thinking" }: ThinkingPartProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const contentRef = useRef<HTMLDivElement | null>(null);
	const bodyRef = useRef<HTMLDivElement | null>(null);
	const autoFollowRef = useRef<boolean>(true);
	const autoFollowFrameRef = useRef<number | null>(null);
	const userScrollFrameRef = useRef<number | null>(null);
	const touchYRef = useRef<number | null>(null);
	const [open, setOpen] = useTimelineDisclosure(disclosureKey, !part.done);

	const cancelAutoFollowFrame = useCallback((): void => {
		if (autoFollowFrameRef.current !== null) {
			window.cancelAnimationFrame(autoFollowFrameRef.current);
			autoFollowFrameRef.current = null;
		}
	}, []);

	const scheduleAutoFollowScroll = useCallback((): void => {
		if (!autoFollowRef.current) {
			return;
		}

		cancelAutoFollowFrame();
		autoFollowFrameRef.current = window.requestAnimationFrame((): void => {
			autoFollowFrameRef.current = null;
			const element: HTMLDivElement | null = contentRef.current;
			if (element !== null && autoFollowRef.current) {
				scrollToThinkingBottom(element);
			}
		});
	}, [cancelAutoFollowFrame]);

	const scheduleUserScrollStateSync = useCallback((): void => {
		if (userScrollFrameRef.current !== null) {
			window.cancelAnimationFrame(userScrollFrameRef.current);
		}

		userScrollFrameRef.current = window.requestAnimationFrame((): void => {
			userScrollFrameRef.current = null;
			const element: HTMLDivElement | null = contentRef.current;
			if (element !== null && isNearScrollBottom(element)) {
				autoFollowRef.current = true;
				scheduleAutoFollowScroll();
			}
		});
	}, [scheduleAutoFollowScroll]);

	useEffect((): void => {
		if (part.done) {
			setOpen(false);
		}
	}, [part.done, setOpen]);

	useLayoutEffect((): (() => void) => {
		const bodyElement: HTMLDivElement | null = bodyRef.current;
		let resizeObserver: ResizeObserver | null = null;

		if (bodyElement !== null && typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver((): void => {
				scheduleAutoFollowScroll();
			});
			resizeObserver.observe(bodyElement);
		}

		scheduleAutoFollowScroll();

		return (): void => {
			resizeObserver?.disconnect();
			cancelAutoFollowFrame();
			if (userScrollFrameRef.current !== null) {
				window.cancelAnimationFrame(userScrollFrameRef.current);
				userScrollFrameRef.current = null;
			}
		};
	}, [cancelAutoFollowFrame, scheduleAutoFollowScroll]);

	useLayoutEffect((): void => {
		if (open) {
			scheduleAutoFollowScroll();
		}
	}, [open, part.text, scheduleAutoFollowScroll]);

	if (part.done && part.text.trim().length === 0) {
		return null;
	}

	return (
		<Collapse
			size="small"
			bordered={false}
			className={styles.collapse}
			destroyOnHidden={true}
			ghost
			activeKey={open ? ["thinking"] : []}
			onChange={(nextKeys: string | string[]): void => {
				const nextOpen: boolean = (Array.isArray(nextKeys) ? nextKeys : [nextKeys]).includes("thinking");
				if (nextOpen) {
					autoFollowRef.current = true;
				}
				setOpen(nextOpen);
			}}
			expandIcon={() => (
				<Icon name="thinking" className={styles.icon} />
			)}
			items={[
				{
					key: "thinking",
					label: part.done
						? t("chat.thinking.label")
						: <ShinyText text={t("chat.thinking.activeLabel")} speed={2.4} />,
					children: (
						<div
							ref={contentRef}
							className={`${styles.thinkingContent} markdown-body`}
							onTouchStart={(event: React.TouchEvent<HTMLDivElement>): void => {
								touchYRef.current = event.touches[0]?.clientY ?? null;
							}}
							onTouchMove={(event: React.TouchEvent<HTMLDivElement>): void => {
								const currentY: number | undefined = event.touches[0]?.clientY;
								const previousY: number | null = touchYRef.current;
								if (currentY === undefined || previousY === null) {
									return;
								}

								if (currentY > previousY) {
									autoFollowRef.current = false;
									cancelAutoFollowFrame();
								} else if (currentY < previousY) {
									scheduleUserScrollStateSync();
								}
								touchYRef.current = currentY;
							}}
							onTouchEnd={(): void => {
								touchYRef.current = null;
								scheduleUserScrollStateSync();
							}}
							onWheel={(event: React.WheelEvent<HTMLDivElement>): void => {
								const element: HTMLDivElement = event.currentTarget;
								if (element.scrollHeight > element.clientHeight) {
									if (event.deltaY < 0) {
										autoFollowRef.current = false;
										cancelAutoFollowFrame();
									} else if (event.deltaY > 0) {
										scheduleUserScrollStateSync();
									}
								}
								containScrollableWheel(event);
							}}
						>
							<div ref={bodyRef} className={styles.thinkingBody}>
								{part.text.trim().length === 0 ? null : (
									<MarkdownContent streaming={!part.done}>{part.text}</MarkdownContent>
								)}
							</div>
						</div>
					)
				}
			]}
		/>
	);
}

export default memo(ThinkingPart);
