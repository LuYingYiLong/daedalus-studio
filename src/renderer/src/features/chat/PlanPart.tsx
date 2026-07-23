import { TimelineBodyPart } from "@/api/types";
import { Icon } from "@/assets/icons";
import { Button, Card, Modal, Tooltip } from "antd";
import React, { useState } from "react";
import styles from "./PlanPart.module.css"
import { copyTextToClipboard } from "@/utils/clipboard";
import MarkdownContent from "../markdown/MarkdownContent";

export type TimelinePlanPart = Extract<TimelineBodyPart, { type: "plan" }>;
export type PlanPartProps = {
	part: TimelinePlanPart;
}

function PlanPart({ part }: PlanPartProps): React.JSX.Element {
	const [modalOpen, setModalOpen] = useState<boolean>(false);
	const [copied, setCopied] = useState<boolean>(false);

	const extra: React.ReactNode = (
		<div>
			<Tooltip title="Open plan">
				<Button
					type="text"
					icon={<Icon name="distraction-free" />}
					onClick={() => setModalOpen(true)}
				/>
			</Tooltip>
			<Tooltip title={copied ? "Copied" : "Copy"}>
				<Button
					type="text"
					icon={<Icon name="copy" />}
					onClick={() => {
						void copyPlan();
					}}
				/>
			</Tooltip>
		</div>
	);

	async function copyPlan(): Promise<void> {
		try {
			await copyTextToClipboard(part.previewMarkdown);
			setCopied(true);
			window.setTimeout((): void => setCopied(false), 1200);
		} catch (error: unknown) {
			console.error("[PlanPart] copy failed", error);
		}
	}

	return (
		<div>
			<Card
				title={part.title}
				extra={extra}
				className={styles.planCard}
				classNames={{
					body: styles.planCardBody
				}}
			>
				<div className={`${styles.markdownPreview} markdown-body`}>
					<MarkdownContent>{part.previewMarkdown}</MarkdownContent>
				</div>
			</Card>
			<Modal 
				title={part.title}
				open={modalOpen}
				width={800}
				footer={null}
				onCancel={() => setModalOpen(false)}
			>
				<div className={`${styles.modalMarkdown} markdown-body`}>
					<MarkdownContent>{part.previewMarkdown}</MarkdownContent>
				</div>
			</Modal>
		</div>
	);
}

export default React.memo(PlanPart);
