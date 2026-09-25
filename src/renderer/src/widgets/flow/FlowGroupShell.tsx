import { memo, useEffect, useRef, useState } from "react";
import { Input } from "antd";
import type { Node, NodeProps } from "@xyflow/react";
import type { FlowDocumentGroup } from "@/platform/rpc/types";
import styles from "./FlowGroupShell.module.css";

export type FlowGroupInteractionNode = Node<{
	group: FlowDocumentGroup;
	isRenaming: boolean;
	onRenameRequest: (groupId: string | null) => void;
	onRename: (groupId: string, title: string) => void;
}, "flowGroup">;

function FlowGroupShell({ data, selected, dragging }: NodeProps<FlowGroupInteractionNode>): React.JSX.Element {
	const [title, setTitle] = useState(data.group.title);
	const renameFinishedRef = useRef(false);
	useEffect((): void => {
		if (data.isRenaming) renameFinishedRef.current = false;
		else setTitle(data.group.title);
	}, [data.group.title, data.isRenaming]);
	const finishRename = (commit: boolean): void => {
		if (!data.isRenaming || renameFinishedRef.current) return;
		renameFinishedRef.current = true;
		if (commit && title.trim()) data.onRename(data.group.groupId, title.trim());
		data.onRenameRequest(null);
	};
	return (
		<div
			className={styles.frame}
			data-selected={selected}
			data-dragging={dragging}
			aria-label={data.group.title}
		>
			<div
				className={styles.header + " flow-group-header"}
				onDoubleClick={(event): void => {
					event.stopPropagation();
					data.onRenameRequest(data.group.groupId);
				}}
			>
				{data.isRenaming ? (
					<Input
						autoFocus
						size="small"
						className={styles.renameInput + " nodrag nopan"}
						value={title}
						onChange={(event): void => setTitle(event.target.value)}
						onBlur={(): void => finishRename(true)}
						onKeyDown={(event): void => {
							event.stopPropagation();
							if (event.key === "Enter") finishRename(true);
							else if (event.key === "Escape") {
								event.preventDefault();
								finishRename(false);
							}
						}}
						onPointerDown={(event): void => event.stopPropagation()}
						onDoubleClick={(event): void => event.stopPropagation()}
					/>
			) : null}
			</div>
		</div>
	);
}

export default memo(FlowGroupShell);
