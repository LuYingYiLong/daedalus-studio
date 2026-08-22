import PluginPanelHost from "./PluginPanelHost";
import type React from "react";

export default function PluginSettingsHost({ view, onAction }: { view: unknown; onAction?: (action: string, value?: unknown) => void }): React.JSX.Element {
	return <PluginPanelHost view={view} onAction={onAction} />;
}
