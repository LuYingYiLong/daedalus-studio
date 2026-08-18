import type { AdditionalContextItem } from "@/platform/rpc/types";
import { Icon } from "@/assets/icons";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import styles from "./AdditionalContextStrip.module.css";
import { summarizeAdditionalContextItem } from "@/features/conversation/additional-context-display";
import { AdditionalContextIcon } from "@/features/conversation/context-item-icon";

export type AdditionalContextStripProps = {
	items: AdditionalContextItem[];
	align?: "start" | "end";
	className?: string;
	interactive?: boolean;
	onTogglePin?: (contextId: string, pinned: boolean) => void;
	onRemove?: (contextId: string) => void;
	onExpandTextAttachment?: (item: AdditionalContextItem) => void;
};

function AdditionalContextStrip({
	items,
	align = "end",
	className,
	interactive = false,
	onTogglePin,
	onRemove,
	onExpandTextAttachment
}: AdditionalContextStripProps): React.JSX.Element | null {
	const { t } = useTranslation();
	if (items.length === 0) {
		return null;
	}

	const stripClassName: string = [
		styles.contextStrip,
		align === "start" ? styles.alignStart : styles.alignEnd,
		className
	].filter(Boolean).join(" ");

	return (
		<div className={stripClassName} aria-label={t("chat.contextStrip.aria")}>
			{items.map((item: AdditionalContextItem): React.ReactNode => {
				const display = summarizeAdditionalContextItem(item, t);
				const nextPinned: boolean = item.pinned !== true;
				const canTogglePin: boolean = interactive && item.kind !== "git_diff_comment" && item.kind !== "message_selection" && item.kind !== "file_selection" && item.kind !== "web_element";
				const canExpandText: boolean = interactive && item.kind === "text_attachment" && onExpandTextAttachment !== undefined;

				return (
					<Tooltip
						key={item.id}
						title={<span style={{ whiteSpace: "pre-line" }}>{display.tooltip}</span>}
						placement="top"
					>
						<span
							className={`${styles.contextChip} ${canTogglePin ? styles.interactiveChip : ""}`}
							role={canTogglePin ? "button" : undefined}
							tabIndex={canTogglePin ? 0 : undefined}
							onClick={canTogglePin ? (event: React.MouseEvent<HTMLSpanElement>): void => {
								event.stopPropagation();
								onTogglePin?.(item.id, nextPinned);
							} : undefined}
							onKeyDown={canTogglePin ? (event: React.KeyboardEvent<HTMLSpanElement>): void => {
								if (event.key !== "Enter" && event.key !== " ") {
									return;
								}

								event.preventDefault();
								event.stopPropagation();
								onTogglePin?.(item.id, nextPinned);
							} : undefined}
							onContextMenu={interactive ? (event: React.MouseEvent<HTMLSpanElement>): void => {
								event.preventDefault();
								event.stopPropagation();
								onRemove?.(item.id);
							} : undefined}
						>
							{canExpandText ? (
								<span
									className={styles.expandTextButton}
									role="button"
									tabIndex={0}
									title={t("chat.contextStrip.expandText")}
									aria-label={t("chat.contextStrip.expandText")}
									onClick={(event: React.MouseEvent<HTMLSpanElement>): void => {
										event.stopPropagation();
										onExpandTextAttachment?.(item);
									}}
									onKeyDown={(event: React.KeyboardEvent<HTMLSpanElement>): void => {
										if (event.key !== "Enter" && event.key !== " ") {
											return;
										}
										event.preventDefault();
										event.stopPropagation();
										onExpandTextAttachment?.(item);
									}}
								>
									<AdditionalContextIcon item={item} className={styles.contextIcon} />
								</span>
							) : <AdditionalContextIcon item={item} className={styles.contextIcon} />}
							<span className={styles.contextText}>
								<span className={styles.contextTitle}>{display.title}</span>
								<span className={styles.contextMeta}>{display.meta}</span>
							</span>
							{item.pinned === true ? <Icon name="pin" className={styles.pinIcon} aria-label={t("chat.contextStrip.pinned")} /> : null}
						</span>
					</Tooltip>
				);
			})}
		</div>
	);
}

export default AdditionalContextStrip;
