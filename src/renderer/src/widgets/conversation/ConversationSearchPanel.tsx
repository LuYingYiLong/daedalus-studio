import { Button, Input, Tooltip } from "antd";
import type { InputRef } from "antd";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import styles from "./ConversationSearchPanel.module.css";

type ConversationSearchPanelProps = {
	open: boolean;
	query: string;
	current: number;
	total: number;
	loading: boolean;
	inputRef: RefObject<InputRef | null>;
	onQueryChange: (query: string) => void;
	onPrevious: () => void;
	onNext: () => void;
	onClose: () => void;
};

export default function ConversationSearchPanel({
	open,
	query,
	current,
	total,
	loading,
	inputRef,
	onQueryChange,
	onPrevious,
	onNext,
	onClose
}: ConversationSearchPanelProps): React.JSX.Element {
	const { t } = useTranslation();
	const navigationDisabled: boolean = total === 0 || query.trim().length === 0;

	return (
		<div
			className={`${styles.panel} ${open ? styles.panelOpen : ""}`}
			aria-hidden={!open}
			aria-busy={loading}
			inert={!open}
		>
			<Input
				ref={inputRef}
				className={styles.input}
				size="small"
				value={query}
				placeholder={t("agentPage.conversationSearch.placeholder")}
				aria-label={t("agentPage.conversationSearch.placeholder")}
				onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
					onQueryChange(event.target.value);
				}}
				onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>): void => {
					if (event.key !== "Enter") {
						return;
					}
					event.preventDefault();
					if (event.shiftKey) {
						onPrevious();
					} else {
						onNext();
					}
				}}
			/>
			<span className={styles.resultCount} aria-live="polite">
				{navigationDisabled ? "0/0" : `${current}/${total}`}
			</span>
			<Tooltip title={t("agentPage.conversationSearch.previous")} trigger={["hover", "focus"]}>
				<Button
					type="text"
					shape="circle"
					size="small"
					disabled={navigationDisabled}
					aria-label={t("agentPage.conversationSearch.previous")}
					icon={<Icon name="arrow-top" />}
					onClick={onPrevious}
				/>
			</Tooltip>
			<Tooltip title={t("agentPage.conversationSearch.next")} trigger={["hover", "focus"]}>
				<Button
					type="text"
					shape="circle"
					size="small"
					disabled={navigationDisabled}
					aria-label={t("agentPage.conversationSearch.next")}
					icon={<Icon name="arrow-bottom" />}
					onClick={onNext}
				/>
			</Tooltip>
			<Tooltip title={t("agentPage.conversationSearch.close")} trigger={["hover", "focus"]}>
				<Button
					type="text"
					shape="circle"
					size="small"
					aria-label={t("agentPage.conversationSearch.close")}
					icon={<Icon name="close" />}
					onClick={onClose}
				/>
			</Tooltip>
		</div>
	);
}
