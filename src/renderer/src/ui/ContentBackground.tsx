import styles from "./ContentBackground.module.css";

/**
 * Paints the configured appearance background behind the content of one surface.
 *
 * The layer reads the --ds-background-* custom properties published by
 * applyStudioBackgroundVariables, so it takes no props, renders nothing visible
 * when no image is configured, and never requests a missing file. Callers must
 * place it as the first child of a positioned container; the host container is
 * expected to establish a stacking context (isolation: isolate).
 */
function ContentBackground(): React.JSX.Element {
	return <div className={styles.background} aria-hidden="true" />;
}

export default ContentBackground;
