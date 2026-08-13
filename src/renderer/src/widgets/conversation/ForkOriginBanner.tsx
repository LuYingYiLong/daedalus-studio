import { Button, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { SessionForkOrigin } from "@/platform/rpc/types";
import styles from "./ForkOriginBanner.module.css";

export type ForkOriginBannerProps = {
	origin: SessionForkOrigin;
	disabled?: boolean;
	onOpenSource: (sessionId: string) => void | Promise<void>;
	onDismiss: () => void;
};

export default function ForkOriginBanner({
	origin,
	disabled = false,
	onOpenSource,
	onDismiss,
}: ForkOriginBannerProps): React.JSX.Element {
	const { t } = useTranslation();
	return (
		<div className={styles.root} role="note">
			<Icon name="fork" className={styles.icon} />
			<Typography.Text type="secondary" className={styles.label}>
				{t("chat.fork.originLabel")}
			</Typography.Text>
			<Tooltip title={t("chat.fork.openSourceTooltip")}>
				<Button
					type="link"
					size="small"
					className={styles.sourceButton}
					disabled={disabled}
					onClick={(): void => {
						void onOpenSource(origin.sessionId);
					}}
				>
					{origin.sessionTitle}
				</Button>
			</Tooltip>
			<Typography.Text type="secondary" ellipsis={{ tooltip: origin.messagePreview }} className={styles.preview}>
				{origin.messagePreview}
			</Typography.Text>
			<Tooltip title={t("chat.fork.dismissOriginTooltip")}>
				<Button
					type="text"
					size="small"
					shape="circle"
					className={styles.dismissButton}
					aria-label={t("chat.fork.dismissOriginAria")}
					icon={<Icon name="close" />}
					onClick={onDismiss}
				/>
			</Tooltip>
		</div>
	);
}
