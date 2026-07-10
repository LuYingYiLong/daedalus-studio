import { Alert } from "antd";
import type { AlertProps } from "antd";
import type { TimelineStatusPart } from "@/api/types";
import styles from "./StatusPart.module.css"

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

function StatusPart({ part }: StatusPartProps): React.JSX.Element | null {
	const title: string = part.title || part.code || "Status";
	const details: string = part.details;

	if (title.length === 0 && details.length === 0) {
		return null;
	}

	return (
		<Alert
			type={getAlertType(part.status)}
			message={title}
			description={details.length > 0 ? details : undefined}
			showIcon={true}
		/>
	);
}

export default StatusPart;