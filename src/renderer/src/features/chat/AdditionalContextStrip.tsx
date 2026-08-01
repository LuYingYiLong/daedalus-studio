import type { AdditionalContextItem } from "@/api/types";
import { Icon } from "@/assets/icons";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import styles from "./AdditionalContextStrip.module.css";
import { summarizeAdditionalContextItem } from "./additional-context-display";
import { AdditionalContextIcon } from "./additional-context-icon";

export type AdditionalContextStripProps = {
	items: AdditionalContextItem[];
	align?: "start" | "end";
	className?: string;
	interactive?: boolean;
	onTogglePin?: (contextId: string, pinned: boolean) => void;
	onRemove?: (contextId: string) => void;
};

function AdditionalContextStrip({
	items,
	align = "end",
	className,
	interactive = false,
	onTogglePin,
	onRemove
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
				const display = summarizeAdditionalContextItem(item);
				const nextPinned: boolean = item.pinned !== true;
				const canTogglePin: boolean = interactive && item.kind !== "git_diff_comment" && item.kind !== "message_selection";

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
							<AdditionalContextIcon item={item} className={styles.contextIcon} />
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
