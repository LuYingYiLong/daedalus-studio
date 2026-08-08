import { Icon } from "@/assets/icons";
import ShinyText from "@/ui/ShinyText";
import { Collapse, CollapseProps, GetProp } from "antd";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTimelineDisclosure } from "@/features/conversation/timeline-disclosure-state";
import {
	getTimelineActivityLabel,
	type TimelineActivityGroupSegment,
	type TimelineActivityPart
} from "@/domain/conversation/timeline-activity-groups";
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
	if (group.stats.tools > 0) {
		parts.push(t("chat.activityGroup.summary.tools", { count: group.stats.tools }));
	}
	if (group.stats.thoughts > 0) {
		parts.push(t("chat.activityGroup.summary.thoughts", { count: group.stats.thoughts }));
	}
	return parts.length > 0 ? parts.join(t("chat.activityGroup.summary.separator")) : t("chat.activityGroup.summary.empty");
}

function TimelineActivityGroup({ group, disclosureKey, renderPart }: TimelineActivityGroupProps): React.JSX.Element {
	const { t } = useTranslation();
	const [open, setOpen] = useTimelineDisclosure(disclosureKey, false);
	const labelText: string = useMemo(
		(): string => group.active
			? getTimelineActivityLabel(group.latestPart, t)
			: getSummaryLabel(group, t),
		[group, t]
	);
	const label: React.ReactNode = group.active ? (
		<ShinyText
			text={labelText}
			speed={2.4}
			color="var(--ds-text-muted)"
			shineColor="var(--ds-text-secondary)"
		/>
	) : labelText;

	return (
		<Collapse
			size="small"
			bordered={false}
			destroyOnHidden={false}
			ghost
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
				),
			}]}
		/>
	);
}

export default React.memo(TimelineActivityGroup);
