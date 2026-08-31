import type { TimelineBodyPart } from "@/platform/rpc/types";
import { Icon } from "@/assets/icons";
import { Collapse, Flex, Typography } from "antd";
import React from "react";
import { useTranslation } from "react-i18next";
import { useTimelineDisclosure } from "@/widgets/conversation/state/timeline-disclosure-state";
import styles from "./ProviderReconnectPart.module.css";

export type TimelineProviderReconnectPart = Extract<TimelineBodyPart, { type: "provider_reconnect" }>;

type ProviderReconnectPartProps = {
	part: TimelineProviderReconnectPart;
	disclosureKey: string;
	streaming: boolean;
};

function ProviderReconnectPart({ part, disclosureKey, streaming }: ProviderReconnectPartProps): React.JSX.Element {
	const { t } = useTranslation();
	const [open, setOpen] = useTimelineDisclosure(disclosureKey, false);
	const reconnectPending: boolean = part.status === "waiting" || part.status === "reconnecting";
	const active: boolean = reconnectPending && streaming;
	const label: string = part.status === "recovered"
		? t("chat.providerReconnect.recovered")
		: part.status === "failed"
			? t("chat.providerReconnect.failed")
			: !streaming
				? t("chat.providerReconnect.stopped")
				: t("chat.providerReconnect.attempt", { attempt: part.attempt, max: part.maxAttempts });
	const reason: string = t(`chat.providerReconnect.reason.${part.reason}`);

	return (
		<Collapse
			size="small"
			bordered={false}
			destroyOnHidden={true}
			activeKey={open ? [part.reconnectId] : []}
			onChange={(keys: string | string[]): void => {
				setOpen((Array.isArray(keys) ? keys : [keys]).includes(part.reconnectId));
			}}
			ghost
			className={styles.collapse}
			expandIcon={(): React.JSX.Element => (
				<span
					className={`${styles.icon} ${active ? styles.iconActive : ""}`}
					aria-label={label}
				>
					<Icon name="wlan" />
				</span>
			)}
			items={[{
				key: part.reconnectId,
				label: <span className={styles.label} aria-live="polite">{label}</span>,
				children: (
					<Flex vertical gap={4} className={styles.details}>
						<Typography.Text>{part.provider} / {part.model}</Typography.Text>
						<Typography.Text type="secondary">
							{t("chat.providerReconnect.timeout", { seconds: Math.round(part.timeoutMs / 1000) })}
						</Typography.Text>
						<Typography.Text type="secondary">{reason}</Typography.Text>
						{part.autoExtended ? (
							<Typography.Text type="secondary">{t("chat.providerReconnect.extended")}</Typography.Text>
						) : null}
					</Flex>
				)
			}]}
		/>
	);
}

export default React.memo(ProviderReconnectPart);
