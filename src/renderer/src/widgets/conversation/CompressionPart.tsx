import type { TimelineBodyPart } from "@/platform/rpc/types";
import { Icon } from "@/assets/icons";
import ShinyText from "@/ui/ShinyText";
import { Collapse, Typography } from "antd";
import React, { memo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import MarkdownContent from "../markdown/MarkdownContent";
import { useTimelineDisclosure } from "@/widgets/conversation/state/timeline-disclosure-state";
import styles from "./CompressionPart.module.css";

export type TimelineCompressionPart = Extract<
	TimelineBodyPart,
	{ type: "compression" }
>;

type CompressionPartProps = {
	part: TimelineCompressionPart;
	disclosureKey: string;
};

function CompressionPart({
	part,
	disclosureKey,
}: CompressionPartProps): React.JSX.Element {
	const { t } = useTranslation();
	const [open, setOpen] = useTimelineDisclosure(disclosureKey, false);
	const active: boolean = part.status === "running";
	const label: React.ReactNode = active ? (
		<ShinyText text={t("chat.compression.running")} speed={2.4} />
	) : (
		t(`chat.compression.${part.status}`)
	);

	useEffect((): void => {
		if (!active) setOpen(false);
	}, [active, setOpen]);

	const details: string =
		part.status === "completed" ? part.summary : part.reason;
	const canExpand: boolean = details.trim().length > 0;
	const itemKey: string = part.compressionId;

	return (
		<Collapse
			size="small"
			bordered={false}
			destroyOnHidden={true}
			activeKey={open && canExpand ? [itemKey] : []}
			onChange={(keys: string | string[]): void => {
				if (!canExpand) return;
				setOpen(
					(Array.isArray(keys) ? keys : [keys]).includes(itemKey),
				);
			}}
			className={`${styles.collapse} ${canExpand ? "" : styles.collapseStatic}`}
			expandIcon={(): React.JSX.Element => (
				<span
					className={`${styles.icon} ${active ? styles.iconActive : ""}`}
					aria-label={
						typeof label === "string"
							? label
							: t("chat.compression.running")
					}
				>
					<Icon name="compress" />
				</span>
			)}
			items={[
				{
					key: itemKey,
					collapsible: canExpand ? undefined : "disabled",
					label: (
						<span className={styles.label} aria-live="polite">
							{label}
						</span>
					),
					children:
						part.status === "completed" ? (
							<div className={`${styles.summary} markdown-body`}>
								<MarkdownContent>{details}</MarkdownContent>
							</div>
						) : (
							<Typography.Text
								type="secondary"
								className={styles.reason}
							>
								{details}
							</Typography.Text>
						),
				},
			]}
		/>
	);
}

export default memo(CompressionPart);
