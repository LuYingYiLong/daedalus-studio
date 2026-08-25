import type {
	DockPanelActivationRequest,
	DockPanelTabsProps,
} from "@/widgets/dock/DockPanelTabs";
import type { DockLayoutPreferences } from "@/domain/session/session-layout";
import type { HomeDockPanelProps } from "./HomeDockPanel";

type SharedDockPanelProps = Omit<
	DockPanelTabsProps,
	| "dockId"
	| "placement"
	| "isOpen"
	| "isFullscreen"
	| "defaultKind"
	| "layout"
	| "activationRequest"
	| "onLayoutChange"
	| "onFullscreenToggle"
>;

type DockPanelConfig = {
	panel: {
		size: number | string;
		min: number;
		max: number | undefined;
	};
	content: HomeDockPanelProps;
};

export type HomeDockPanelConfigs = {
	sideDockConfig: DockPanelConfig | null;
	bottomDockConfig: DockPanelConfig | null;
	renderSideDock: boolean;
	renderBottomDock: boolean;
};

export type CreateHomeDockPanelConfigsParams = {
	sharedProps: SharedDockPanelProps;
	side: {
		enabled: boolean;
		isOpen: boolean;
		size: number;
		isFullscreen: boolean;
		layout: DockLayoutPreferences;
		activationRequest: DockPanelActivationRequest | null;
		onLayoutChange: (layout: DockLayoutPreferences) => void;
		onFullscreenToggle: () => void;
		slotClassName: string;
		closedSize: number;
		maxSize: number;
	};
	bottom: {
		enabled: boolean;
		isOpen: boolean;
		size: number;
		isFullscreen: boolean;
		isSideFullscreen: boolean;
		layout: DockLayoutPreferences;
		onLayoutChange: (layout: DockLayoutPreferences) => void;
		onFullscreenToggle: () => void;
		slotClassName: string;
		closedSize: number;
		maxSize: number;
	};
};

/** 只负责 Dock 配置组装；Splitter 节点仍由 HomePage 持有，避免改变拖拽和全屏时的挂载顺序。 */
export function createHomeDockPanelConfigs({
	sharedProps,
	side,
	bottom,
}: CreateHomeDockPanelConfigsParams): HomeDockPanelConfigs {
	const sideDockConfig: DockPanelConfig | null = side.enabled
		? {
				panel: {
					size: side.isFullscreen
						? "100%"
						: side.isOpen
							? side.size
							: side.closedSize,
					min: side.closedSize,
					max: side.isFullscreen ? undefined : side.maxSize,
				},
				content: {
					...sharedProps,
					dockId: "side",
					placement: "side",
					isOpen: side.isOpen,
					isFullscreen: side.isFullscreen,
					defaultKind: "review",
					layout: side.layout,
					activationRequest: side.activationRequest,
					onLayoutChange: side.onLayoutChange,
					onFullscreenToggle: side.onFullscreenToggle,
					slotClassName: side.slotClassName,
				},
			}
		: null;
	const bottomDockConfig: DockPanelConfig | null = bottom.enabled
		? {
				panel: {
					size: bottom.isFullscreen
						? "100%"
						: bottom.isSideFullscreen
							? bottom.closedSize
							: bottom.isOpen
								? bottom.size
								: bottom.closedSize,
					min: bottom.closedSize,
					max: bottom.isFullscreen ? undefined : bottom.maxSize,
				},
				content: {
					...sharedProps,
					dockId: "bottom",
					placement: "bottom",
					isOpen: bottom.isOpen,
					isFullscreen: bottom.isFullscreen,
					defaultKind: "terminal",
					layout: bottom.layout,
					onLayoutChange: bottom.onLayoutChange,
					onFullscreenToggle: bottom.onFullscreenToggle,
					slotClassName: bottom.slotClassName,
				},
			}
		: null;

	return {
		sideDockConfig,
		bottomDockConfig,
		renderSideDock:
			sideDockConfig !== null && (side.isOpen || side.isFullscreen),
		renderBottomDock:
			bottomDockConfig !== null && (bottom.isOpen || bottom.isFullscreen),
	};
}
