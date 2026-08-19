import { Button, Dropdown, Input, Space, Spin, Tooltip, Typography, type MenuProps } from "antd";
import { Icon } from "@/assets/icons";
import type { BrowserViewState } from "../../../../contracts/browser";
import styles from "./BrowserPanel.module.css";

type BrowserToolbarProps = {
	state: BrowserViewState;
	address: string;
	inspecting: boolean;
	hasCredentials: boolean;
	menuItems: MenuProps["items"];
	aiBusy: boolean;
	onAddressChange: (value: string) => void;
	onNavigate: () => void;
	onAction: (action: "back" | "forward" | "reload" | "stop") => void;
	onInspect: () => void;
	onOpenCredentials: () => void;
	labels: {
		back: string;
		forward: string;
		reload: string;
		address: string;
		inspect: string;
		credentials: string;
		more: string;
		aiOperating: string;
	};
};

function BrowserToolbar({
	state,
	address,
	inspecting,
	hasCredentials,
	menuItems,
	aiBusy,
	onAddressChange,
	onNavigate,
	onAction,
	onInspect,
	onOpenCredentials,
	labels,
}: BrowserToolbarProps): React.JSX.Element {
	return (
		<header className={styles.toolbar}>
			<Space className={styles.navigationButtons}>
				<Tooltip title={labels.back} mouseEnterDelay={1}>
					<Button
						type="text"
						shape="circle"
						icon={<Icon name="arrow-left" />}
						aria-label={labels.back}
						disabled={!state.canGoBack}
						onClick={(): void => onAction("back")}
					/>
				</Tooltip>
				<Tooltip title={labels.forward} mouseEnterDelay={1}>
					<Button
						type="text"
						shape="circle"
						icon={<Icon name="arrow-right" />}
						aria-label={labels.forward}
						disabled={!state.canGoForward}
						onClick={(): void => onAction("forward")}
					/>
				</Tooltip>
				<Tooltip title={labels.reload} mouseEnterDelay={1}>
					<Button
						type="text"
						shape="circle"
						icon={<Icon name="reload" />}
						aria-label={labels.reload}
						disabled={state.url === null}
						onClick={(): void => onAction("reload")}
					/>
				</Tooltip>
			</Space>
			<Input
				className={styles.addressInput}
				value={address}
				placeholder={labels.address}
				allowClear
				aria-label={labels.address}
				onChange={(event): void => onAddressChange(event.target.value)}
				onPressEnter={onNavigate}
			/>
			{aiBusy ? (
				<Space size={4} className={styles.automationStatus}>
					<Spin size="small" />
					<Typography.Text type="secondary">{labels.aiOperating}</Typography.Text>
				</Space>
			) : null}
			{state.url === null ? null : (
				<Tooltip title={labels.inspect} mouseEnterDelay={1}>
					<Button
						type={inspecting ? "primary" : "text"}
						shape="circle"
						icon={<Icon name="inspect" />}
						aria-label={labels.inspect}
						aria-pressed={inspecting}
						onClick={onInspect}
					/>
				</Tooltip>
			)}
			{state.url === null || !hasCredentials ? null : (
				<Tooltip title={labels.credentials} mouseEnterDelay={1}>
					<Button
						type="text"
						shape="circle"
						icon={<Icon name="shield" />}
						aria-label={labels.credentials}
						onClick={onOpenCredentials}
					/>
				</Tooltip>
			)}
			<Dropdown menu={{ items: menuItems }} trigger={["click"]}>
				<Tooltip title={labels.more} mouseEnterDelay={1}>
					<Button
						type="text"
						shape="circle"
						icon={<Icon name="more-v" />}
						aria-label={labels.more}
					/>
				</Tooltip>
			</Dropdown>
		</header>
	);
}

export default BrowserToolbar;
