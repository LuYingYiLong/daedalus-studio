import { TimelineBodyPart } from "@/api/types";
import { Icon } from "@/assets/icons";
import { Button, Card, Modal, Tooltip } from "antd";
import React, { useState } from "react";
import styles from "./PlanPart.module.css"
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type TimelinePlanPart = Extract<TimelineBodyPart, { type: "plan" }>;
export type PlanPartProps = {
	part: TimelinePlanPart;
}

function PlanPart({ part }: PlanPartProps): React.JSX.Element {
	const [modalOpen, setModalOpen] = useState<boolean>(false);

	const extra: React.ReactNode = (
		<div>
			<Tooltip title="Open plan">
				<Button
					type="text"
					icon={<Icon name="distraction_free" />}
					onClick={() => setModalOpen(true)}
				/>
			</Tooltip>
			<Button
				type="text"
				icon={<Icon name="copy" />}
				onClick={async () => {
					await navigator.clipboard.writeText(part.previewMarkdown);
				}}
			/>
		</div>
	);

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
					<Markdown remarkPlugins={[remarkGfm]}>
						{part.previewMarkdown}
					</Markdown>
				</div>
			</Card>
			<Modal 
				title={part.title}
				open={modalOpen}
				width={800}
				onOk={() => setModalOpen(false)}
				onCancel={() => setModalOpen(false)}
			>
				<div className={`${styles.modalMarkdown} markdown-body`}>
					<Markdown remarkPlugins={[remarkGfm]}>
						{part.previewMarkdown}
					</Markdown>
				</div>
			</Modal>
		</div>
	);
}

export default PlanPart;
