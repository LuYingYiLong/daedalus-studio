import type { AdditionalContextItem } from "@/api/types";
import { Icon } from "@/assets/icons";
import { Tooltip } from "antd";
import styles from "./AdditionalContextStrip.module.css";
import { summarizeAdditionalContextItem } from "./additional-context-display";

export type AdditionalContextStripProps = {
	items: AdditionalContextItem[];
};

function AdditionalContextStrip({ items }: AdditionalContextStripProps): React.JSX.Element | null {
	if (items.length === 0) {
		return null;
	}

	return (
		<div className={styles.contextStrip} aria-label="Message context">
			{items.map((item: AdditionalContextItem): React.ReactNode => {
				const display = summarizeAdditionalContextItem(item);

				return (
					<Tooltip
						key={item.id}
						title={<span style={{ whiteSpace: "pre-line" }}>{display.tooltip}</span>}
						placement="top"
					>
						<span className={styles.contextChip}>
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
