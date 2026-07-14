import type { AdditionalContextItem } from "@/api/types";
import { Icon } from "@/assets/icons";
import { Tooltip } from "antd";
import styles from "./AdditionalContextStrip.module.css";
import { summarizeAdditionalContextItem } from "./additional-context-display";

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
	if (items.length === 0) {
		return null;
	}

	const stripClassName: string = [
		styles.contextStrip,
		align === "start" ? styles.alignStart : styles.alignEnd,
		className
	].filter(Boolean).join(" ");

	return (
		<div className={stripClassName} aria-label="Message context">
			{items.map((item: AdditionalContextItem): React.ReactNode => {
				const display = summarizeAdditionalContextItem(item);
				const nextPinned: boolean = item.pinned !== true;

				return (
					<Tooltip
						key={item.id}
						title={<span style={{ whiteSpace: "pre-line" }}>{display.tooltip}</span>}
						placement="top"
					>
						<span
							className={`${styles.contextChip} ${interactive ? styles.interactiveChip : ""}`}
							role={interactive ? "button" : undefined}
							tabIndex={interactive ? 0 : undefined}
							onClick={interactive ? (event: React.MouseEvent<HTMLSpanElement>): void => {
								event.stopPropagation();
								onTogglePin?.(item.id, nextPinned);
							} : undefined}
							onKeyDown={interactive ? (event: React.KeyboardEvent<HTMLSpanElement>): void => {
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
							<Icon name={display.iconName} className={styles.contextIcon} />
							<span className={styles.contextText}>
								<span className={styles.contextTitle}>{display.title}</span>
								<span className={styles.contextMeta}>{display.meta}</span>
							</span>
							{item.pinned === true ? <Icon name="pin" className={styles.pinIcon} aria-label="Pinned" /> : null}
						</span>
					</Tooltip>
				);
			})}
		</div>
	);
}

export default AdditionalContextStrip;
