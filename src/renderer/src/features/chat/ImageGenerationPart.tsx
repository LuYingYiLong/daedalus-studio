import { Alert, Dropdown, Image, message, Spin, Typography, type MenuProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { TimelineBodyPart, TimelineGeneratedImageArtifact } from "@/api/types";
import { fetchGeneratedImageDataUrl } from "@/api/generated-image-api";
import { Icon } from "@/assets/icons";
import styles from "./ImageGenerationPart.module.css";

export type TimelineImageGenerationPart = Extract<TimelineBodyPart, { type: "image_generation" }>;

type LoadedImage = {
	artifact: TimelineGeneratedImageArtifact;
	dataUrl: string;
};

const FALLBACK_IMAGE: string = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iMjQwIiB2aWV3Qm94PSIwIDAgMjQwIDI0MCI+PHJlY3Qgd2lkdGg9IjI0MCIgaGVpZ2h0PSIyNDAiIGZpbGw9IiMxZjFmMWYiLz48dGV4dCB4PSIxMjAiIHk9IjEyMCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxNCIgZm9udC1mYW1pbHk9IkFyaWFsIj5JbWFnZSBub3QgYXZhaWxhYmxlPC90ZXh0Pjwvc3ZnPg==";

function getArtifacts(part: TimelineImageGenerationPart): TimelineGeneratedImageArtifact[] {
	return part.artifacts ?? [];
}

async function copyImage(dataUrl: string): Promise<void> {
	if (!("ClipboardItem" in window)) {
		throw new Error("Clipboard image copy is not supported in this browser.");
	}
	const response: Response = await fetch(dataUrl);
	const blob: Blob = await response.blob();
	await navigator.clipboard.write([
		new ClipboardItem({
			[blob.type]: blob
		})
	]);
}

function downloadImage(image: LoadedImage): void {
	const link: HTMLAnchorElement = document.createElement("a");
	link.href = image.dataUrl;
	link.download = image.artifact.fileName || `${image.artifact.imageId}.png`;
	link.click();
}

function ImageGenerationPart({ part }: { part: TimelineImageGenerationPart }): React.JSX.Element {
	const [messageApi, contextHolder] = message.useMessage();
	const artifacts: TimelineGeneratedImageArtifact[] = useMemo((): TimelineGeneratedImageArtifact[] => getArtifacts(part), [part]);
	const [loadedImages, setLoadedImages] = useState<LoadedImage[]>([]);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [previewOpen, setPreviewOpen] = useState<boolean>(false);
	const [previewCurrent, setPreviewCurrent] = useState<number>(0);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadImages(): Promise<void> {
			if (part.status !== "completed" || artifacts.length === 0) {
				setLoadedImages([]);
				return;
			}

			try {
				setErrorMessage(null);
				const results: LoadedImage[] = await Promise.all(artifacts.map(async (artifact: TimelineGeneratedImageArtifact): Promise<LoadedImage> => {
					const result = await fetchGeneratedImageDataUrl(artifact.sessionId, artifact.imageId);
					return {
						artifact,
						dataUrl: result.dataUrl
					};
				}));
				if (!cancelled) {
					setLoadedImages(results);
				}
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : "Failed to load generated image");
				}
			}
		}

		void loadImages();

		return (): void => {
			cancelled = true;
		};
	}, [artifacts, part.status]);

	const previewItems: string[] = loadedImages.map((image: LoadedImage): string => image.dataUrl);
	const modelLabel: string = part.provider !== undefined && part.model !== undefined
		? `${part.provider} / ${part.model}`
		: "Image generation";

	function createImageContextMenu(image: LoadedImage): MenuProps {
		return {
			items: [
				{
					key: "copy-image",
					label: "Copy image",
					icon: <Icon name="copy" />
				},
				{
					key: "save-image",
					label: "Save image",
					icon: <Icon name="download" />
				}
			],
			onClick: (info): void => {
				info.domEvent.stopPropagation();
				if (info.key === "copy-image") {
					void copyImage(image.dataUrl)
						.then((): void => {
							void messageApi.success("Image copied");
						})
						.catch((error: unknown): void => {
							void messageApi.error(error instanceof Error ? error.message : "Failed to copy image");
						});
					return;
				}

				if (info.key === "save-image") {
					downloadImage(image);
				}
			}
		};
	}

	if (part.status === "running") {
		return (
			<section className={styles.root}>
				<div className={styles.header}>
					<div className={styles.title}>
						<Typography.Title level={4} className={styles.title}>Generating images</Typography.Title>
						<Typography.Text
							copyable={{
								icon: [<Icon name="copy" />],
								tooltips: ['Copy', 'Copied'],
							}}
							className={styles.prompt}
						>
							{part.prompt}
						</Typography.Text>
					</div>
					<Spin size="small" />
				</div>
			</section>
		);
	}

	if (part.status === "failed") {
		return (
			<section className={styles.root}>
				<Alert
					className={styles.alert}
					type="error"
					showIcon={true}
					title="Image generation failed"
					description={part.error ?? "Unknown error"}
				/>
			</section>
		);
	}

	return (
		<section className={styles.root}>
			{contextHolder}
			<div className={styles.header}>
				<div className={styles.title}>
					<Typography.Title level={4} className={styles.title}>Generated images</Typography.Title>
					<Typography.Text type="secondary" className={styles.modelLabel}>{modelLabel}</Typography.Text>
					<Typography.Text
						copyable={{
							icon: [<Icon name="copy" />, <Icon name="check" />],
							tooltips: ["Copy", "Copied"],
						}}
						className={styles.prompt}
					>
						{part.prompt}
					</Typography.Text>
				</div>
			</div>
			{errorMessage !== null ? (
				<Alert type="warning" showIcon={true} title="Image preview unavailable" description={errorMessage} />
			) : null}
			<Image.PreviewGroup
				items={previewItems}
				classNames={{
					popup: {
						close: styles.previewClose,
						footer: styles.previewFooter,
						actions: styles.previewActions
					}
				}}
				preview={{
					open: previewOpen,
					current: previewCurrent,
					onOpenChange: (open: boolean): void => setPreviewOpen(open),
					onChange: (current: number): void => setPreviewCurrent(current)
				}}
			>
				<div className={styles.grid}>
					{artifacts.map((artifact: TimelineGeneratedImageArtifact, index: number): React.JSX.Element => {
						const loadedImage: LoadedImage | undefined = loadedImages.find((image: LoadedImage): boolean => image.artifact.imageId === artifact.imageId);
						const imageButton: React.JSX.Element = (
							<button
								key={artifact.imageId}
								type="button"
								className={styles.imageButton}
								onClick={(): void => {
									setPreviewCurrent(index);
									setPreviewOpen(true);
								}}
							>
								{loadedImage === undefined ? (
									<div className={styles.placeholder}>
										<Spin size="small" />
									</div>
								) : (
									<Image
										className={styles.thumbnail}
										src={loadedImage.dataUrl}
										alt={artifact.prompt}
										fallback={FALLBACK_IMAGE}
										placeholder={<div className={styles.placeholder}>Loading</div>}
										preview={false}
									/>
								)}
							</button>
						);
						if (loadedImage === undefined) {
							return imageButton;
						}
						return (
							<Dropdown
								key={artifact.imageId}
								trigger={["contextMenu"]}
								menu={createImageContextMenu(loadedImage)}
							>
								{imageButton}
							</Dropdown>
						);
					})}
				</div>
			</Image.PreviewGroup>
		</section>
	);
}

export default ImageGenerationPart;
