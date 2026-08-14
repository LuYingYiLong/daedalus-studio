import { Button, Divider, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { TimelineDividerBlock } from "@/platform/rpc/types";
import styles from "./DividerPart.module.css";

export type DividerPartProps = {
	block: TimelineDividerBlock;
	onOpenForkSource?: (sessionId: string) => void | Promise<void>;
};

export default function DividerPart({ block, onOpenForkSource }: DividerPartProps): React.JSX.Element {
	const { t } = useTranslation();
	if (block.dividerKind === "fork_origin" && block.origin !== undefined) {
		const origin = block.origin;
		return (
			<Divider plain size="small" className={styles.divider}>
				<span className={styles.content} role="note">
					<Icon name="fork" className={styles.icon} />
					<Typography.Text type="secondary">{t("chat.fork.originLabel")}</Typography.Text>
					<Tooltip title={t("chat.fork.openSourceTooltip")}>
						<Button
							type="link"
							size="small"
							className={styles.sourceButton}
							aria-label={t("chat.fork.openSourceAria")}
							onClick={(): void => {
								void onOpenForkSource?.(origin.sessionId);
							}}
						>
							{origin.sessionTitle}
						</Button>
					</Tooltip>
					<Typography.Text type="secondary" ellipsis={{ tooltip: origin.messagePreview }} className={styles.preview}>
						{origin.messagePreview}
					</Typography.Text>
				</span>
			</Divider>
		);
	}

	return (
		<Divider plain size="small" className={styles.divider}>
			<Typography.Text type="secondary" role="note">
				{t("chat.fork.modelChanged", {
					from: block.from?.label ?? "",
					to: block.to?.label ?? "",
				})}
			</Typography.Text>
		</Divider>
	);
}
