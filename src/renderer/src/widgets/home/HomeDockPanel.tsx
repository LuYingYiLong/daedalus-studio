import { Splitter } from "antd";
import DockPanelTabs, { type DockPanelTabsProps } from "@/widgets/dock/DockPanelTabs";

export type HomeDockPanelProps = DockPanelTabsProps & {
	panelSize: number | string;
	panelMin: number;
	panelMax?: number;
	slotClassName: string;
};

function HomeDockPanel({
	panelSize,
	panelMin,
	panelMax,
	slotClassName,
	...dockPanelProps
}: HomeDockPanelProps): React.JSX.Element {
	return (
		<Splitter.Panel
			size={panelSize}
			min={panelMin}
			max={panelMax}
			collapsible={{ start: true, showCollapsibleIcon: false }}
		>
			<div className={slotClassName} aria-hidden={!dockPanelProps.isOpen}>
				<DockPanelTabs {...dockPanelProps} />
			</div>
		</Splitter.Panel>
	);
}

export default HomeDockPanel;
