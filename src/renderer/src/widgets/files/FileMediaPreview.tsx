import { Alert, Button, Space, Typography } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import styles from "./FileMediaPreview.module.css";

type FileMediaPreviewProps = {
	url: string;
	mimeType: string;
	kind: "image" | "audio" | "video";
	fileName: string;
	onOpenExternal: () => void;
};

export default function FileMediaPreview({ url, mimeType, kind, fileName, onOpenExternal }: FileMediaPreviewProps): React.JSX.Element {
	const { t } = useTranslation();
	const [failed, setFailed] = useState<boolean>(false);

	return (
		<div className={styles.preview}>
			{failed ? <Alert type="warning" showIcon message={t("files.mediaPlaybackError")} /> : null}
			{kind === "image" ? <img className={styles.image} src={url} alt={fileName} draggable={false} onError={(): void => setFailed(true)} /> : null}
			{kind === "audio" ? <audio className={styles.audio} controls preload="metadata" src={url} aria-label={fileName} onError={(): void => setFailed(true)} /> : null}
			{kind === "video" ? <video className={styles.video} controls preload="metadata" playsInline src={url} aria-label={fileName} onError={(): void => setFailed(true)} /> : null}
			<Space className={styles.footer} align="center">
				<Icon name="file-media" />
				<Typography.Text type="secondary" ellipsis={{ tooltip: fileName }}>{fileName}</Typography.Text>
				<Button icon={<Icon name="external-link" />} onClick={onOpenExternal}>{t("files.openExternal")}</Button>
			</Space>
			<Typography.Text className={styles.mimeType} type="secondary">{mimeType}</Typography.Text>
		</div>
	);
}
