import { Alert, Button } from "antd";
import type { AlertProps } from "antd";
import type { TimelineBodyPart } from "@/api/types";
import { memo } from "react";
import styles from "./StatusPart.module.css"

export type TimelineStatusPart = Extract<TimelineBodyPart, {type: "status"}>;
export type StatusPartProps = {
	part: TimelineStatusPart;
};

function getAlertType(status: string): AlertProps["type"] {
	if (status === "success") {
		return "success";
	}

	if (status === "error") {
		return "error";
	}

	if (status === "warning") {
		return "warning";
	}

	return "info";
}

function handleStatusAction(actionId: string | undefined): void {
	if (actionId === "configure_godot") {
		window.dispatchEvent(new CustomEvent("daedalus:open-settings", {
			detail: { page: "general" }
		}));
	}
}

function StatusPart({ part }: StatusPartProps): React.JSX.Element | null {
	const title: string = part.title || part.code || "Status";
	const details: string = part.details;

	if (title.length === 0 && details.length === 0) {
		return null;
	}

	return (
		<Alert
			className={styles.alert}
			type={getAlertType(part.status)}
			title={title}
			description={details.length > 0 ? details : undefined}
			action={part.actionLabel === undefined ? undefined : (
				<Button
					size="small"
					type="link"
					onClick={(): void => handleStatusAction(part.actionId)}
				>
					{part.actionLabel}
				</Button>
			)}
			showIcon={true}
		/>
	);
}

export default memo(StatusPart);
