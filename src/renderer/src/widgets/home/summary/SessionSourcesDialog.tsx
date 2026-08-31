import { useEffect, useRef, useState, type JSX } from "react";
import { Alert, Button, Modal, Skeleton, Spin } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import {
	fetchSessionOverviewSourceImageDataUrl,
	type SessionOverviewResult,
	type SessionOverviewSourceItem
} from "@/platform/rpc/session-overview-api";
import { formatSourceSubtitle } from "@/domain/session/session-overview-formatters";
import styles from "./SessionSourcesDialog.module.css";

type SessionSourcesDialogProps = {
	overview: SessionOverviewResult | null;
	open: boolean;
	loading: boolean;
	error: string | null;
	onClose: () => void;
	onSourceSelect: (source: SessionOverviewSourceItem) => void;
};

type SessionSourceGridItemProps = {
	sessionId: string;
	source: SessionOverviewSourceItem;
	open: boolean;
	onSelect: (source: SessionOverviewSourceItem) => void;
};

function isImageSource(source: SessionOverviewSourceItem): boolean {
	return source.kind === "image_attachment" || source.kind === "generated_image";
}

function SessionSourceGridItem({ sessionId, source, open, onSelect }: SessionSourceGridItemProps): JSX.Element {
	const { t } = useTranslation();
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(source.thumbnailDataUrl);
	const [shouldLoadImage, setShouldLoadImage] = useState<boolean>(source.thumbnailDataUrl !== undefined);
	const [imageLoadFailed, setImageLoadFailed] = useState<boolean>(false);
	const imageSource: boolean = isImageSource(source);

	useEffect((): void => {
		if (source.thumbnailDataUrl !== undefined) {
			setImageDataUrl(source.thumbnailDataUrl);
			setImageLoadFailed(false);
		}
	}, [source.thumbnailDataUrl]);

	useEffect((): (() => void) | void => {
		if (!open || !imageSource || imageDataUrl !== undefined || imageLoadFailed || shouldLoadImage) {
			return;
		}
		const element: HTMLButtonElement | null = buttonRef.current;
		if (element === null || typeof IntersectionObserver === "undefined") {
			setShouldLoadImage(true);
			return;
		}

		const observer = new IntersectionObserver((entries: IntersectionObserverEntry[]): void => {
			if (entries.some((entry: IntersectionObserverEntry): boolean => entry.isIntersecting)) {
				setShouldLoadImage(true);
				observer.disconnect();
			}
		}, { rootMargin: "160px 0px" });
		observer.observe(element);
		return (): void => observer.disconnect();
	}, [imageDataUrl, imageLoadFailed, imageSource, open, shouldLoadImage]);

	useEffect((): (() => void) | void => {
		if (!imageSource || !shouldLoadImage || imageDataUrl !== undefined || imageLoadFailed) {
			return;
		}
		let cancelled: boolean = false;
		void fetchSessionOverviewSourceImageDataUrl(sessionId, source)
			.then((dataUrl: string): void => {
				if (!cancelled) {
					setImageDataUrl(dataUrl);
				}
			})
			.catch((error: unknown): void => {
				if (!cancelled) {
					console.warn("[SessionSourcesDialog] failed to load source image", {
						sessionId,
						sourceId: source.id,
						error
					});
					setImageLoadFailed(true);
				}
			});
		return (): void => {
			cancelled = true;
		};
	}, [imageDataUrl, imageLoadFailed, imageSource, sessionId, shouldLoadImage, source]);

	const selectable: boolean = !imageSource || imageDataUrl !== undefined;
	return (
		<Button
			ref={buttonRef}
			type="text"
			className={styles.sourceGridButton}
			classNames={{ content: styles.sourceGridButtonContent }}
			title={source.title}
			disabled={!selectable}
			onClick={(): void => {
				if (selectable) {
					onSelect(imageDataUrl === undefined ? source : { ...source, thumbnailDataUrl: imageDataUrl });
				}
			}}
		>
			{imageDataUrl !== undefined ? (
				<img
					src={imageDataUrl}
					alt=""
					className={styles.sourceGridThumbnail}
					decoding="async"
				/>
			) : imageSource && !imageLoadFailed ? (
				<Skeleton.Node active className={styles.sourceGridThumbnailSkeleton} />
			) : (
				<span className={styles.sourceGridTextIcon}>
					<Icon name={imageLoadFailed ? "warning" : "txt"} />
				</span>
			)}
			<span className={styles.sourceGridText}>
				<span className={styles.summaryItemTitle}>{source.title}</span>
				<span className={styles.summaryMeta}>{formatSourceSubtitle(source, t)}</span>
			</span>
		</Button>
	);
}

export default function SessionSourcesDialog({ overview, open, loading, error, onClose, onSourceSelect }: SessionSourcesDialogProps): JSX.Element {
	const { t } = useTranslation();
	const sources: SessionOverviewSourceItem[] = overview?.sources.items ?? [];

	return (
		<Modal
			title={t("agentPage.summary.sections.source")}
			open={open}
			footer={null}
			onCancel={onClose}
			width={640}
			className={styles.modal}
		>
			{error !== null ? <Alert type="error" showIcon message={error} className={styles.sourceGridStatus} /> : null}
			<div className={styles.summarySourceGrid}>
				{sources.map((source: SessionOverviewSourceItem): JSX.Element => (
					<SessionSourceGridItem
						key={`${source.kind}:${source.id}`}
						sessionId={overview?.sessionId ?? ""}
						source={source}
						open={open}
						onSelect={onSourceSelect}
					/>
				))}
			</div>
			{loading ? <div className={styles.sourceGridStatus}><Spin size="small" /></div> : null}
		</Modal>
	);
}
