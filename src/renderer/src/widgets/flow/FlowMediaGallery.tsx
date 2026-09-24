import { Button, Image, Select, Space, Typography } from "antd";
import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { FlowMediaArtifactRef } from "@/platform/rpc/types";
import { imagePreviewCloseIcon, renderImagePreviewToolbar } from "@/ui/image-preview-toolbar";
import { getFlowPreviewSource } from "./flow-resource-cache";

function Preview({
	artifact,
	mediaSource,
	thumbnail = false,
}: {
	artifact?: FlowMediaArtifactRef;
	mediaSource?: FlowMediaGallerySource;
	thumbnail?: boolean;
}): React.JSX.Element {
	const [source, setSource] = useState<string | null>(null);
	useEffect(() => {
		let disposed = false;
		if (mediaSource !== undefined) {
			setSource(mediaSource.url);
			return () => {
				disposed = true;
			};
		}
		if (artifact === undefined) {
			setSource(null);
			return;
		}
		setSource(null);
		void getFlowPreviewSource(artifact.artifactId, artifact.mimeType, thumbnail)
			.then((value) => {
				if (!disposed) setSource(value);
			})
			.catch(() => {});
		return () => {
			disposed = true;
		};
	}, [artifact?.artifactId, artifact?.mimeType, mediaSource?.mimeType, mediaSource?.url, thumbnail]);
	const mimeType = mediaSource?.mimeType ?? artifact?.mimeType;
	if (!mimeType) return <></>;
	if (!source) return <Typography.Text type="secondary">{mimeType}</Typography.Text>;
	if (mimeType.startsWith("image/"))
		return (
			<Image
				src={source}
				alt={mediaSource?.alt ?? ""}
				preview={
					thumbnail
						? false
						: {
								closeIcon: imagePreviewCloseIcon,
								actionsRender: renderImagePreviewToolbar,
							}
				}
				classNames={{
					popup: {
						close: "daedalus-image-preview-close",
						footer: "daedalus-image-preview-footer",
						actions: "daedalus-image-preview-actions",
					},
				}}
				style={{ width: "100%", height: "100%", objectFit: "contain" }}
				styles={{ root: { width: "100%", height: "100%", minHeight: 0 } }}
			/>
		);
	if (mimeType.startsWith("video/"))
		return <video src={source} controls preload="metadata" style={{ width: "100%", height: "100%" }} />;
	return <audio src={source} controls preload="metadata" />;
}

export type FlowMediaGallerySource = { url: string; mimeType: string; alt?: string };
type FlowMediaGalleryProps =
	| { artifacts: FlowMediaArtifactRef[]; source?: never }
	| { source: FlowMediaGallerySource; artifacts?: never };

function ArtifactGallery({ artifacts }: { artifacts: FlowMediaArtifactRef[] }): React.JSX.Element {
	const { t } = useTranslation();
	const [selected, setSelected] = useState(0);
	const [compare, setCompare] = useState<number | null>(null);
	const strip = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(900);
	useEffect(() => {
		const element = strip.current;
		if (!element) return;
		const observer = new ResizeObserver(() => setWidth(element.clientWidth));
		observer.observe(element);
		return () => observer.disconnect();
	}, [artifacts.length]);
	const [scroll, setScroll] = useState(0);
	const unique = [...new Map(artifacts.map((item) => [item.artifactId, item])).values()];
	const active = unique[Math.min(selected, unique.length - 1)];
	if (!active) return <></>;
	if (unique.length === 1) return <Preview artifact={active} />;
	const start = Math.max(0, Math.floor(scroll / 90) - 1);
	return (
		<div
			className="nodrag"
			style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, height: "100%" }}
		>
			<Space wrap>
				<Typography.Text>
					{Math.min(selected + 1, unique.length)} / {unique.length}
				</Typography.Text>
				<Select
					allowClear
					placeholder={t("flow.batch.compare")}
					value={compare ?? undefined}
					options={unique.map((item, index) => ({ value: index, label: String(index + 1) }))}
					onChange={(value) => setCompare(value ?? null)}
				/>
			</Space>
			<div style={{ flex: "1 1 160px", minHeight: 80, display: "flex", gap: 8 }}>
				<div style={{ flex: 1, minWidth: 0 }}>
					<Preview artifact={active} />
				</div>
				{compare !== null && unique[compare] && (
					<div style={{ flex: 1, minWidth: 0 }}>
						<Preview artifact={unique[compare]} />
					</div>
				)}
			</div>
			<div
				ref={strip}
				style={{ height: 96, flexShrink: 0, overflowX: "auto", overflowY: "hidden" }}
				onScroll={(event) => setScroll(event.currentTarget.scrollLeft)}
			>
				<div style={{ width: unique.length * 90, height: 84, position: "relative" }}>
					{unique.slice(start, start + Math.ceil(width / 90) + 2).map((item, offset) => (
						<Button
							key={item.artifactId}
							onClick={() => setSelected(start + offset)}
							style={{
								position: "absolute",
								left: (start + offset) * 90,
								width: 84,
								height: 80,
								padding: 2,
							}}
						>
							<Preview artifact={item} thumbnail />
						</Button>
					))}
				</div>
			</div>
			<Typography.Text type="secondary" ellipsis title={JSON.stringify(active.metadata)}>
				{active.width} × {active.height} · {active.mimeType}
			</Typography.Text>
		</div>
	);
}

export function FlowMediaGallery(props: FlowMediaGalleryProps): React.JSX.Element {
	if ("source" in props && props.source !== undefined)
		return (
			<div className="nodrag" style={{ display: "flex", width: "100%", height: "100%", minHeight: 80 }}>
				<Preview mediaSource={props.source} />
			</div>
		);
	return <ArtifactGallery artifacts={props.artifacts} />;
}
