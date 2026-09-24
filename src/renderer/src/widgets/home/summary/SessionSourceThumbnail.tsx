import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { Icon } from "@/assets/icons";
import {
	fetchFlowOverviewSourcePreviewDataUrl,
	fetchSessionOverviewSourceImageDataUrl,
	type SessionOverviewSourceItem,
} from "@/platform/rpc/session-overview-api";
import styles from "./SessionSourceThumbnail.module.css";

type Props = {
	sessionId: string;
	source: SessionOverviewSourceItem;
	active: boolean;
	className?: string;
	style?: CSSProperties;
};

export default function SessionSourceThumbnail({
	sessionId,
	source,
	active,
	className,
	style,
}: Props): JSX.Element {
	const ref = useRef<HTMLSpanElement | null>(null);
	const [shouldLoad, setShouldLoad] = useState<boolean>(source.thumbnailDataUrl !== undefined);
	const [preview, setPreview] = useState<string | null>(source.thumbnailDataUrl ?? null);
	const [failed, setFailed] = useState<boolean>(false);
	const [videoReady, setVideoReady] = useState<boolean>(false);
	const image =
		source.kind === "image_attachment" ||
		source.kind === "generated_image" ||
		(source.kind === "flow_media_artifact" && source.mimeType.startsWith("image/"));
	const video =
		source.kind === "flow_media_artifact" && source.mimeType.startsWith("video/");
	const media = image || video;

	useEffect((): void => {
		setPreview(source.thumbnailDataUrl ?? null);
		setShouldLoad(source.thumbnailDataUrl !== undefined);
		setFailed(false);
		setVideoReady(false);
	}, [source.id, source.kind, source.thumbnailDataUrl]);

	useEffect((): (() => void) | void => {
		if (!active || !media || preview !== null || failed || shouldLoad) return;
		const element = ref.current;
		if (element === null || typeof IntersectionObserver === "undefined") {
			setShouldLoad(true);
			return;
		}
		const observer = new IntersectionObserver((entries): void => {
			if (entries.some((entry): boolean => entry.isIntersecting)) {
				setShouldLoad(true);
				observer.disconnect();
			}
		}, { rootMargin: "120px" });
		observer.observe(element);
		return (): void => observer.disconnect();
	}, [active, failed, media, preview, shouldLoad]);

	useEffect((): (() => void) | void => {
		if (!active || !media || !shouldLoad || preview !== null || failed) return;
		let cancelled = false;
		const load = image
			? fetchSessionOverviewSourceImageDataUrl(sessionId, source)
			: fetchFlowOverviewSourcePreviewDataUrl(source);
		void load
			.then((url: string): void => {
				if (!cancelled) setPreview(url);
			})
			.catch((error: unknown): void => {
				if (cancelled) return;
				console.warn("[SessionSourceThumbnail] failed to load source preview", {
					sourceId: source.id,
					error,
				});
				setFailed(true);
			});
		return (): void => {
			cancelled = true;
		};
	}, [active, failed, image, media, preview, sessionId, shouldLoad, source]);

	const handleVideoMetadata = (event: React.SyntheticEvent<HTMLVideoElement>): void => {
		const element = event.currentTarget;
		if (!Number.isFinite(element.duration) || element.duration <= 0) return;
		try {
			element.currentTime = Math.min(0.25, element.duration / 4);
		} catch {
			setVideoReady(true);
		}
	};

	return (
		<span
			ref={ref}
			className={[styles.frame, className ?? ""].filter(Boolean).join(" ")}
			style={style}
			aria-hidden="true"
		>
			{preview !== null && image && !failed ? (
				<img
					className={styles.media}
					src={preview}
					alt=""
					decoding="async"
					onError={(): void => setFailed(true)}
				/>
			) : null}
			{preview !== null && video ? (
				<video
					className={styles.media}
					src={preview}
					muted
					playsInline
					preload="metadata"
					onLoadedMetadata={handleVideoMetadata}
					onLoadedData={(): void => setVideoReady(true)}
					onSeeked={(): void => setVideoReady(true)}
					onError={(): void => setFailed(true)}
				/>
			) : null}
			{preview === null || failed || (video && !videoReady) ? (
				<span className={styles.fallback}>
					<Icon name={failed ? "warning" : video ? "video" : "txt"} />
				</span>
			) : null}
			{video && videoReady ? (
				<span className={styles.playBadge}>
					<Icon name="play" />
				</span>
			) : null}
		</span>
	);
}
