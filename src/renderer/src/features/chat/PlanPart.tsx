import { TimelineBodyPart } from "@/api/types";
import { Icon } from "@/assets/icons";
import { Button, Card } from "antd";
import React from "react";
import styles from "./PlanPart.module.css"
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type TimelinePlanPart = Extract<TimelineBodyPart, { type: "plan" }>;
export type PlanPartProps = {
	part: TimelinePlanPart;
}

function PlanPart({ part }: PlanPartProps): React.JSX.Element {
	const extra: React.ReactNode = (
		<Button
			type="text"
			size="small"
			icon={<Icon name="copy" />}
			onClick={async () => {
				await navigator.clipboard.writeText(part.previewMarkdown);
			}}
		/>
	);

	return (
		<Card
			size="small"
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
	);
}

export default PlanPart;
