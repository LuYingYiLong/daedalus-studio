import styles from "./ContentBackground.module.css";

/**
 * Paints the configured appearance background behind the entire window shell.
 *
 * The layer reads the --ds-background-* custom properties published by
 * applyStudioBackgroundVariables, so it takes no props, renders nothing visible
 * when no image is configured, and never requests a missing file. The window
 * provider places it as the first child of an isolated, positioned container.
 */
function ContentBackground(): React.JSX.Element {
	return <div className={styles.background} aria-hidden="true" />;
}

export default ContentBackground;
