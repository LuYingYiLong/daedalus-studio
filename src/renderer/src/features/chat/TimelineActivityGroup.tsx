import { Icon } from "@/assets/icons";
import { Collapse } from "antd";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTimelineDisclosure } from "./timeline-disclosure-state";
import {
	getTimelineActivityLabel,
	type TimelineActivityGroupSegment,
	type TimelineActivityPart
} from "./timeline-activity-groups";
import styles from "./TimelineActivityGroup.module.css";

export type TimelineActivityGroupProps = {
	group: TimelineActivityGroupSegment;
	disclosureKey: string;
	renderPart: (part: TimelineActivityPart, index: number, childKey: string) => React.ReactNode;
};

function getSummaryLabel(group: TimelineActivityGroupSegment, t: (key: string, options?: Record<string, unknown>) => string): string {
	const parts: string[] = [];
	if (group.stats.editedFiles > 0) {
		parts.push(t("chat.activityGroup.summary.files", { count: group.stats.editedFiles }));
	}
	if (group.stats.commands > 0) {
		parts.push(t("chat.activityGroup.summary.commands", { count: group.stats.commands }));
	}
	if (group.stats.thoughts > 0) {
		parts.push(t("chat.activityGroup.summary.thoughts", { count: group.stats.thoughts }));
	}
	return parts.length > 0 ? parts.join(t("chat.activityGroup.summary.separator")) : t("chat.activityGroup.summary.empty");
}

function TimelineActivityGroup({ group, disclosureKey, renderPart }: TimelineActivityGroupProps): React.JSX.Element {
	const { t } = useTranslation();
	const [open, setOpen] = useTimelineDisclosure(disclosureKey, false);
	const label: string = useMemo(
		(): string => group.active
			? getTimelineActivityLabel(group.latestPart, t)
			: getSummaryLabel(group, t),
		[group, t]
	);

	return (
		<Collapse
			size="small"
			bordered={false}
			destroyOnHidden={false}
			className={styles.collapse}
			activeKey={open ? [group.id] : []}
			onChange={(keys: string | string[]): void => {
				setOpen((Array.isArray(keys) ? keys : [keys]).includes(group.id));
			}}
			expandIcon={({ isActive }) => (
				<span className={`collapseExpandIcon ${isActive ? "collapseExpandIconActive" : ""}`}>
					<Icon name="arrow-down" />
				</span>
			)}
			items={[{
				key: group.id,
				label: label,
				children: (
					<div className={styles.content}>
						{group.parts.map((part: TimelineActivityPart, offset: number): React.ReactNode => renderPart(part, group.partIndexes[offset] as number, `${group.id}:${offset}`))}
					</div>
				)
			}]}
		/>
	);
}

export default React.memo(TimelineActivityGroup);
