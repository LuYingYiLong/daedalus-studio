import type { ReactNode } from "react";
import { Splitter } from "antd";
import HomeChatSurface, {
	type HomeChatSurfaceProps,
} from "./HomeChatSurface";
import FullscreenComposerShelf from "./FullscreenComposerShelf";
import HomeDockPanel from "../dock/HomeDockPanel";
import type { HomeDockPanelConfigs } from "../dock/home-dock-panel-config";
import {
	BOTTOM_DOCK_CLOSED_SIZE,
	SIDE_DOCK_CLOSED_SIZE,
} from "../dock/useHomePageDockController";
import ScheduledTasksPage from "@/widgets/scheduled-tasks/ScheduledTasksPage";
import styles from "../HomePage.module.css";

export type HomePageWorkbenchProps = {
	mainSurface: "chat" | "scheduledTasks";
	activeFullscreenDock: "side" | "bottom" | null;
	fullscreenMotionDisabled: boolean;
	bottomDockFullscreen: boolean;
	sideDockFullscreen: boolean;
	isDockFullscreen: boolean;
	isFullscreenBrowserPanel: boolean;
	pageActionControls: ReactNode;
	chatSurfaceProps: HomeChatSurfaceProps;
	sideDockConfig: HomeDockPanelConfigs["sideDockConfig"];
	bottomDockConfig: HomeDockPanelConfigs["bottomDockConfig"];
	renderSideDock: boolean;
	renderBottomDock: boolean;
	renderComposer: (compact: boolean) => React.JSX.Element;
	onBottomDockResize: (sizes: number[]) => void;
	onBottomDockResizeEnd: (sizes: number[]) => void;
	onSideDockResize: (sizes: number[]) => void;
	onSideDockResizeEnd: (sizes: number[]) => void;
	onScheduledTasksOverlayTransitionEnd: (
		event: React.TransitionEvent<HTMLDivElement>,
	) => void;
	onCreateScheduledTask: () => void;
	onOpenScheduledTaskSession: (sessionId: string) => void;
	defaultWorkspaceId: string | null;
	defaultProviderId: string | null;
	defaultModelId: string | null;
	defaultReasoningEffort: string | null;
};

function HomePageWorkbench({
	mainSurface,
	activeFullscreenDock,
	fullscreenMotionDisabled,
	bottomDockFullscreen,
	sideDockFullscreen,
	isDockFullscreen,
	isFullscreenBrowserPanel,
	pageActionControls,
	chatSurfaceProps,
	sideDockConfig,
	bottomDockConfig,
	renderSideDock,
	renderBottomDock,
	renderComposer,
	onBottomDockResize,
	onBottomDockResizeEnd,
	onSideDockResize,
	onSideDockResizeEnd,
	onScheduledTasksOverlayTransitionEnd,
	onCreateScheduledTask,
	onOpenScheduledTaskSession,
	defaultWorkspaceId,
	defaultProviderId,
	defaultModelId,
	defaultReasoningEffort,
}: HomePageWorkbenchProps): React.JSX.Element {
	return (
		<div
			className={styles.agentMain}
			data-main-surface={mainSurface}
			data-dock-fullscreen={activeFullscreenDock ?? undefined}
		>
			{pageActionControls !== null ? (
				<div className={styles.floatingActionSlot}>
					{pageActionControls}
				</div>
			) : null}
			<Splitter
				className={styles.agentVerticalSplitter}
				data-dock-fullscreen={activeFullscreenDock ?? undefined}
				data-fullscreen-motion-disabled={
					fullscreenMotionDisabled ? "true" : undefined
				}
				draggerIcon={null}
				orientation="vertical"
				collapsible={{ motion: true }}
				onResize={onBottomDockResize}
				onResizeEnd={onBottomDockResizeEnd}
			>
				<Splitter.Panel
					min={
						bottomDockFullscreen
							? BOTTOM_DOCK_CLOSED_SIZE
							: 360
					}
					size={bottomDockFullscreen ? 0 : undefined}
				>
					<Splitter
						className={styles.agentSplitter}
						data-dock-fullscreen={
							sideDockFullscreen ? "side" : undefined
						}
						data-fullscreen-motion-disabled={
							fullscreenMotionDisabled ? "true" : undefined
						}
						draggerIcon={null}
						collapsible={{ motion: true }}
						onResize={onSideDockResize}
						onResizeEnd={onSideDockResizeEnd}
					>
						<Splitter.Panel
							min={
								sideDockFullscreen
									? SIDE_DOCK_CLOSED_SIZE
									: 360
							}
							size={sideDockFullscreen ? 0 : undefined}
						>
							<HomeChatSurface {...chatSurfaceProps} />
						</Splitter.Panel>
						<Splitter.Panel
							size={
								sideDockConfig?.panel.size ??
								SIDE_DOCK_CLOSED_SIZE
							}
							min={
								sideDockConfig?.panel.min ??
								SIDE_DOCK_CLOSED_SIZE
							}
							max={sideDockConfig?.panel.max}
							collapsible={{
								start: true,
								showCollapsibleIcon: false,
							}}
						>
							{renderSideDock && sideDockConfig !== null ? (
								<HomeDockPanel {...sideDockConfig.content} />
							) : null}
						</Splitter.Panel>
					</Splitter>
				</Splitter.Panel>
				<Splitter.Panel
					size={
						bottomDockConfig?.panel.size ??
						BOTTOM_DOCK_CLOSED_SIZE
					}
					min={
						bottomDockConfig?.panel.min ??
						BOTTOM_DOCK_CLOSED_SIZE
					}
					max={bottomDockConfig?.panel.max}
					collapsible={{
						start: true,
						showCollapsibleIcon: false,
					}}
				>
					{renderBottomDock && bottomDockConfig !== null ? (
						<HomeDockPanel {...bottomDockConfig.content} />
					) : null}
				</Splitter.Panel>
			</Splitter>
			{isDockFullscreen && !isFullscreenBrowserPanel ? (
				<FullscreenComposerShelf>
					{renderComposer(true)}
				</FullscreenComposerShelf>
			) : null}
			<div
				className={[
					styles.scheduledTasksOverlay,
					mainSurface === "scheduledTasks"
						? styles.scheduledTasksOverlayActive
						: "",
				]
					.filter(Boolean)
					.join(" ")}
				onTransitionEnd={onScheduledTasksOverlayTransitionEnd}
				aria-hidden={mainSurface !== "scheduledTasks"}
			>
				<ScheduledTasksPage
					onCreate={onCreateScheduledTask}
					onOpenSession={onOpenScheduledTaskSession}
					defaultWorkspaceId={defaultWorkspaceId}
					defaultProviderId={defaultProviderId}
					defaultModelId={defaultModelId}
					defaultReasoningEffort={defaultReasoningEffort}
				/>
			</div>
		</div>
	);
}

export default HomePageWorkbench;
