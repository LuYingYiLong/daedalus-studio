import { Button, message, Tooltip } from "antd";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import { exportFlowArtifacts } from "@/platform/rpc/flow-api";
import type { FlowMediaArtifactRef } from "@/platform/rpc/types";
import styles from "./FlowNodes.module.css";

type FlowNodeExtraProps = {
	typeId: string;
	nodeId: string;
	title: string;
	runInputLabel: string;
	runDisabled: boolean;
	output: unknown;
	mediaArtifacts: FlowMediaArtifactRef[];
	workspaceRoot?: string;
	onAction: (nodeId: string, action: string) => void;
};

function savedDirectory(output: unknown): string | null {
	if (typeof output !== "object" || output === null) return null;
	const result = (output as Record<string, unknown>).result;
	if (typeof result !== "object" || result === null) return null;
	const saved = (result as Record<string, unknown>).saved;
	if (!Array.isArray(saved)) return null;
	for (const item of saved) {
		if (typeof item !== "object" || item === null) continue;
		const relativePath = (item as Record<string, unknown>).relativePath;
		if (typeof relativePath !== "string" || relativePath.length === 0) continue;
		const parts = relativePath.replaceAll("\\", "/").split("/");
		return parts.slice(0, -1).join("/") || ".";
	}
	return null;
}

function outputText(output: unknown): { content: string; extension: string } {
	let value = output;
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		const entries = Object.values(value);
		if (entries.length === 1) value = entries[0];
	}
	return typeof value === "string"
		? { content: value, extension: "txt" }
		: { content: JSON.stringify(value, null, 2), extension: "json" };
}

export function FlowNodeExtra(props: FlowNodeExtraProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const [busy, setBusy] = useState(false);
	const { typeId, nodeId, title, runInputLabel, runDisabled, output, mediaArtifacts, workspaceRoot, onAction } = props;
	const isOutput = typeId === "builtin/output" || typeId === "builtin/media-output";
	const isSaveNode = typeId === "builtin/save-images" || typeId === "builtin/save-videos";
	const directory = isSaveNode ? savedDirectory(output) : null;
	const exportOutput = async (): Promise<void> => {
		if (output === null || output === undefined || window.electronAPI === undefined) return;
		setBusy(true);
		try {
			if (mediaArtifacts.length > 0) {
				const artifacts = [...new Map(mediaArtifacts.map((ref) => [ref.artifactId, ref])).values()];
				const directoryMode = artifacts.length > 1;
				const mime = artifacts[0]!.mimeType;
				const extension = mime === "image/jpeg" ? "jpg" : mime === "video/quicktime" ? "mov" : mime.split("/")[1]?.replace(/[^a-z0-9]/giu, "") || "bin";
				const destinationPath = await window.electronAPI.fileExport.pickArtifactDestination({
					directory: directoryMode,
					defaultFileName: `${title}.${extension}`,
				});
				if (destinationPath === null) return;
				await exportFlowArtifacts({ flowId: artifacts[0]!.flowId, artifactIds: artifacts.map((ref) => ref.artifactId), destinationPath, directory: directoryMode });
			} else {
				const { content, extension } = outputText(output);
				const result = await window.electronAPI.fileExport.saveText({
					defaultFileName: `${title}.${extension}`,
					content,
					dialogTitle: t("flow.editor.saveOutput", { defaultValue: "Save output as file" }),
					buttonLabel: t("flow.editor.save", { defaultValue: "Save" }),
				});
				if (!result.saved) return;
			}
			void message.success(t("flow.editor.outputSaved", { defaultValue: "Output saved" }));
		} catch (error) {
			void message.error(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};
	const openDirectory = async (): Promise<void> => {
		if (directory === null || workspaceRoot === undefined || window.electronAPI === undefined) return;
		setBusy(true);
		try {
			await window.electronAPI.workspaceFs.openFile({ workspaceRoot, filePath: directory });
		} catch (error) {
			void message.error(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};
	const button = (label: string, icon: "play" | "download" | "folder-open", disabled: boolean, onClick: () => void): React.JSX.Element => (
		<Tooltip title={label}>
			<Button
				type="text"
				shape="circle"
				size="small"
				className={`${styles.headerActionButton} nodrag nopan`}
				icon={<Icon name={icon} />}
				disabled={disabled || busy}
				aria-label={label}
				onPointerDown={(event): void => event.stopPropagation()}
				onClick={(event): void => { event.stopPropagation(); onClick(); }}
			/>
		</Tooltip>
	);
	if (typeId === "builtin/flow-input") {
		const label = t("flow.editor.runEntry", { input: runInputLabel });
		return button(label, "play", runDisabled, () => onAction(nodeId, "run-input"));
	}
	if (isOutput) return button(t("flow.editor.saveOutput", { defaultValue: "Save output as file" }), "download", output === null || output === undefined, () => { void exportOutput(); });
	if (isSaveNode) return button(t("flow.editor.openSavedDirectory", { defaultValue: "Open saved files folder" }), "folder-open", directory === null || workspaceRoot === undefined, () => { void openDirectory(); });
	return null;
}

export function FlowNodeHeaderActions({ extra, children }: { extra?: ReactNode; children?: ReactNode }): React.JSX.Element {
	return <div className={styles.headerActions}>{extra}{children}</div>;
}
