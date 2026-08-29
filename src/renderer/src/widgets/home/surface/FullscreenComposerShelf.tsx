import { useState, type ReactNode } from "react";
import { Button, Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import styles from "./FullscreenComposerShelf.module.css";

type FullscreenComposerShelfProps = {
	children: ReactNode;
};

function FullscreenComposerShelf({
	children,
}: FullscreenComposerShelfProps): React.JSX.Element {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState<boolean>(true);

	return (
		<div
			className={[
				styles.root,
				isOpen ? styles.open : styles.closed,
			]
				.filter(Boolean)
				.join(" ")}
		>
			<div
				className={styles.drawer}
				data-drawer-open={isOpen ? "true" : "false"}
			>
				<Tooltip
					title={t("composer.floating.close")}
					mouseEnterDelay={0.5}
				>
					<Button
						className={styles.closeButton}
						aria-label={t("composer.floating.close")}
						icon={<Icon name="arrow-down" />}
						onClick={(): void => setIsOpen(false)}
					/>
				</Tooltip>
				<div className={styles.footer} aria-hidden={!isOpen}>
					{children}
				</div>
			</div>
			<Tooltip title={t("composer.floating.open")} mouseEnterDelay={0.5}>
				<Button
					className={styles.openButton}
					aria-label={t("composer.floating.open")}
					icon={<Icon name="arrow-top" />}
					onClick={(): void => setIsOpen(true)}
				/>
			</Tooltip>
		</div>
	);
}

export default FullscreenComposerShelf;
