import type { DragEventHandler, ReactNode } from "react";
import { Splitter } from "antd";
import type { WorkspaceSidebarPreferences } from "@/platform/rpc/client-preferences-api";
import styles from "../HomePage.module.css";

const WORKSPACE_SIDEBAR_CLOSED_SIZE: number = 0;
const WORKSPACE_SIDEBAR_MAX_SIZE: number = 720;

type HomePageShellProps = {
	messageContextHolder: ReactNode;
	workspaceSidebar: ReactNode;
	workspaceSidebarPreferences: WorkspaceSidebarPreferences;
	children: ReactNode;
	onDragOver: DragEventHandler<HTMLDivElement>;
	onDrop: DragEventHandler<HTMLDivElement>;
	onWorkspaceSidebarResize: (sizes: number[]) => void;
	onWorkspaceSidebarResizeEnd: (sizes: number[]) => void;
};

function HomePageShell({
	messageContextHolder,
	workspaceSidebar,
	workspaceSidebarPreferences,
	children,
	onDragOver,
	onDrop,
	onWorkspaceSidebarResize,
	onWorkspaceSidebarResizeEnd,
}: HomePageShellProps): React.JSX.Element {
	return (
		<div
			className={styles.page}
			data-studio-home="true"
			onDragOver={onDragOver}
			onDrop={onDrop}
		>
			{messageContextHolder}
			<Splitter
				className={styles.workspaceSplitter}
				draggerIcon={null}
				collapsible={{ motion: true }}
				onResize={onWorkspaceSidebarResize}
				onResizeEnd={onWorkspaceSidebarResizeEnd}
			>
				<Splitter.Panel
					size={
						workspaceSidebarPreferences.open
							? workspaceSidebarPreferences.size
							: WORKSPACE_SIDEBAR_CLOSED_SIZE
					}
					min={WORKSPACE_SIDEBAR_CLOSED_SIZE}
					max={WORKSPACE_SIDEBAR_MAX_SIZE}
					collapsible={{ end: true, showCollapsibleIcon: false }}
				>
					{workspaceSidebar}
				</Splitter.Panel>
				<Splitter.Panel min={360}>{children}</Splitter.Panel>
			</Splitter>
		</div>
	);
}

export default HomePageShell;
