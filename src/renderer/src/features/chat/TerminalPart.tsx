import { Icon } from "@/assets/icons";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import { Button, Collapse, Spin, Tag, Tooltip } from "antd";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { readTerminalDisplay as readSharedTerminalDisplay, isTerminalCommandPart, type TerminalDisplay as SharedTerminalDisplay, type TimelineToolPart } from "./tool-part-data";
import { useTimelineDisclosure } from "./timeline-disclosure-state";
import styles from "./TerminalPart.module.css";

type TerminalStatus = "approval" | "running" | "success" | "failed" | "timed_out" | "cancelled" | "background";

type TerminalDisplay = SharedTerminalDisplay;

export type TerminalPartProps = {
	part: TimelineToolPart;
	disclosureKey: string;
	onScrollWheelPassThrough?: (deltaY: number) => void;
};

function getString(record: Record<string, unknown> | undefined, key: string): string {
	const value: unknown = record?.[key];
	return typeof value === "string" ? value : "";
}

function getLatestEvent(events: Record<string, unknown>[], type: string): Record<string, unknown> | undefined {
	return [...events].reverse().find((event: Record<string, unknown>): boolean => event.type === type);
}

function getLatestEventIndex(events: Record<string, unknown>[], eventTypes: readonly string[]): number {
	for (let index: number = events.length - 1; index >= 0; index -= 1) {
		if (eventTypes.includes(String(events[index]?.type ?? ""))) return index;
	}
	return -1;
}

export { isTerminalCommandPart } from "./tool-part-data";

function readTerminalDisplay(part: TimelineToolPart): TerminalDisplay {
	return readSharedTerminalDisplay(part);
}

function getTerminalStatus(part: TimelineToolPart, display: TerminalDisplay): TerminalStatus {
	const resultEvent: Record<string, unknown> | undefined = getLatestEvent(part.events, "tool.result");
	const errorEvent: Record<string, unknown> | undefined = getLatestEvent(part.events, "tool.error");
	if (errorEvent !== undefined) {
		const message: string = getString(errorEvent, "message").toLowerCase();
		if (message.includes("cancel")) return "cancelled";
		if (message.includes("timed out") || message.includes("timeout")) return "timed_out";
		return "failed";
	}
	if (getLatestEvent(part.events, "tool.rejected") !== undefined) return "cancelled";
	if (resultEvent !== undefined) {
		if (display.executionMode === "job" && display.status === "running") return "background";
		if (display.status === "timed_out") return "timed_out";
		if (display.status === "cancelled") return "cancelled";
		if (resultEvent.ok === false || (display.exitCode !== null && display.exitCode !== 0) || ["failed", "spawn_error"].includes(display.status)) return "failed";
		return "success";
	}
	const approvalIndex: number = getLatestEventIndex(part.events, ["tool.approval_required"]);
	const executionIndex: number = getLatestEventIndex(part.events, ["tool.approved", "tool.call", "tool.progress"]);
	return approvalIndex > executionIndex ? "approval" : "running";
}

function formatDuration(durationMs: number): string {
	if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
	if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
	const minutes: number = Math.floor(durationMs / 60_000);
	const seconds: number = Math.floor((durationMs % 60_000) / 1000);
	return `${minutes}m ${seconds}s`;
}

function canConsumeOutputWheel(element: HTMLElement, deltaY: number): boolean {
	if (deltaY === 0 || element.scrollHeight <= element.clientHeight) {
		return false;
	}

	if (deltaY < 0) {
		return element.scrollTop > 0;
	}

	return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
}

function TerminalPart({ part, disclosureKey, onScrollWheelPassThrough }: TerminalPartProps): React.JSX.Element {
	const { t } = useTranslation();
	const [open, setOpen] = useTimelineDisclosure(disclosureKey, false);
	const [copied, setCopied] = useState<"command" | "output" | null>(null);
	const outputRef = useRef<HTMLDivElement | null>(null);
	const followOutputRef = useRef<boolean>(true);
	const display: TerminalDisplay = useMemo((): TerminalDisplay => readTerminalDisplay(part), [part]);
	const status: TerminalStatus = getTerminalStatus(part, display);
	const outputText: string = [display.stdout, display.stderr].filter((value: string): boolean => value.length > 0).join("\n");

	useLayoutEffect(() => {
		if (!open) return;
		const element: HTMLDivElement | null = outputRef.current;
		if (element === null) return;

		if (followOutputRef.current) {
			element.scrollTop = element.scrollHeight;
		}

		const observer: ResizeObserver = new ResizeObserver((): void => {
			if (followOutputRef.current) {
				element.scrollTop = element.scrollHeight;
			}
		});
		observer.observe(element);
		return (): void => observer.disconnect();
	}, [display.stderr, display.stdout, open]);

	async function copy(kind: "command" | "output", value: string): Promise<void> {
		try {
			await copyTextToClipboard(value);
			setCopied(kind);
			window.setTimeout((): void => setCopied((current): "command" | "output" | null => current === kind ? null : current), 1200);
		} catch (error: unknown) {
			console.error("[TerminalPart] copy failed", error);
		}
	}

	const statusColors: Record<TerminalStatus, string> = {
		approval: "gold",
		running: "processing",
		success: "green",
		failed: "red",
		timed_out: "orange",
		cancelled: "default",
		background: "blue"
	};
	const statusLabel: string = t(`chat.terminalPart.status.${status}`);
	const metadata: Array<{ label: string; value: string }> = [
		{ label: t("chat.terminalPart.cwd"), value: display.cwd },
		...(display.sandboxMode === undefined ? [] : [{ label: t("chat.terminalPart.sandbox"), value: display.sandboxMode }]),
		...(display.exitCode === null ? [] : [{ label: t("chat.terminalPart.exitCode"), value: String(display.exitCode) }]),
		...(display.durationMs === undefined ? [] : [{ label: t("chat.terminalPart.duration"), value: formatDuration(display.durationMs) }]),
		...(display.jobId === undefined ? [] : [{ label: t("chat.terminalPart.jobId"), value: display.jobId }])
	];

	return (
		<Collapse
			size="small"
			bordered={false}
			destroyOnHidden
			activeKey={open ? ["terminal"] : []}
			onChange={(keys: string | string[]): void => setOpen((Array.isArray(keys) ? keys : [keys]).includes("terminal"))}
			className={styles.collapse}
			expandIcon={() => <Icon name="terminal" className={styles.icon} />}
			items={[{
				key: "terminal",
				label: <code className={styles.commandLabel} title={display.commandLine}>{display.commandLine || t("chat.terminalPart.commandFallback")}</code>,
				extra: (
					<Tag color={statusColors[status]} className={styles.statusTag}>
						{statusLabel}
					</Tag>
				),
				children: (
					<div className={styles.body}>
						<div className={styles.commandBlock}>
							<code>{display.commandLine || t("chat.terminalPart.commandFallback")}</code>
							<Tooltip title={copied === "command" ? t("chat.common.copied") : t("chat.terminalPart.copyCommand")}>
								<Button type="text" shape="circle" size="small" aria-label={t("chat.terminalPart.copyCommand")} icon={<Icon name={copied === "command" ? "check" : "copy"} />} onClick={(event): void => {
									event.stopPropagation();
									void copy("command", display.commandLine);
								}} />
							</Tooltip>
						</div>
						<div className={styles.outputHeader}>
							<span>{t("chat.terminalPart.output")}</span>
						</div>
						<div ref={outputRef} className={styles.output} onWheel={(event: React.WheelEvent<HTMLDivElement>): void => {
							const element: HTMLDivElement = event.currentTarget;
							if (canConsumeOutputWheel(element, event.deltaY)) {
								event.stopPropagation();
								return;
							}

							if (event.deltaY !== 0 && onScrollWheelPassThrough !== undefined) {
								event.preventDefault();
								event.stopPropagation();
								onScrollWheelPassThrough(event.deltaY);
							}
						}} onScroll={(event): void => {
							const element: HTMLDivElement = event.currentTarget;
							followOutputRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 16;
						}}>
							{display.stdout.length > 0 ? <section><span>stdout</span>{display.stdoutOmittedChars > 0 ? <em>{t("chat.terminalPart.omitted", { count: display.stdoutOmittedChars })}</em> : null}<pre>{display.stdout}</pre></section> : null}
							{display.stderr.length > 0 ? <section className={styles.stderr}><span>stderr</span>{display.stderrOmittedChars > 0 ? <em>{t("chat.terminalPart.omitted", { count: display.stderrOmittedChars })}</em> : null}<pre>{display.stderr}</pre></section> : null}
							{outputText.length === 0 ? <div className={styles.empty}>{status === "running" ? t("chat.terminalPart.waitingOutput") : t("chat.terminalPart.noOutput")}</div> : null}
						</div>
					</div>
				)
			}]}
		/>
	);
}

export default React.memo(TerminalPart);
