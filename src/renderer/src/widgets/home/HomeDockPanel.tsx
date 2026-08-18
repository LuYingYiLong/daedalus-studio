import DockPanelTabs, { type DockPanelTabsProps } from "@/widgets/dock/DockPanelTabs";

export type HomeDockPanelProps = DockPanelTabsProps & {
	slotClassName: string;
};

function HomeDockPanel({
	slotClassName,
	...dockPanelProps
}: HomeDockPanelProps): React.JSX.Element {
	return (
		<div className={slotClassName} aria-hidden={!dockPanelProps.isOpen}>
			<DockPanelTabs {...dockPanelProps} />
		</div>
	);
}

export default HomeDockPanel;
