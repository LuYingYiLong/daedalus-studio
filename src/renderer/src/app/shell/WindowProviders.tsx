import { useEffect } from "react";
import { App as AntdApp } from "antd";
import useClientPreferencesController from "@/features/application/hooks/useClientPreferencesController";
import InputContextMenu from "@/ui/InputContextMenu";
import styles from "./WindowProviders.module.css";
import SharedVisualProviders from "./SharedVisualProviders";

type WindowProvidersProps = {
	children: React.ReactNode;
};

function ForegroundScheduledNotificationBridge(): null {
	const { notification } = AntdApp.useApp();

	useEffect((): (() => void) => {
		return window.electronAPI.nativeNotifications.onForeground((payload): void => {
			notification.open({
				key: payload.dedupeKey,
				message: payload.title,
				description: payload.body,
				placement: "bottomRight",
			});
		});
	}, [notification]);

	return null;
}

function WindowProviders({
	children,
}: WindowProvidersProps): React.JSX.Element {
	const {
		resolvedTheme,
		resolvedLanguage,
		themeColor,
		fontFamily,
		fontFamilyCode,
		animationsEnabled,
		uiFontSize,
		codeFontSize,
	} = useClientPreferencesController();
	return (
		<SharedVisualProviders
			resolvedTheme={resolvedTheme}
			resolvedLanguage={resolvedLanguage}
			themeColor={themeColor}
			fontFamily={fontFamily}
			fontFamilyCode={fontFamilyCode}
			uiFontSize={uiFontSize}
			codeFontSize={codeFontSize}
			animationsEnabled={animationsEnabled}
			className={styles.root}
		>
			<ForegroundScheduledNotificationBridge />
			{children}
			<InputContextMenu />
		</SharedVisualProviders>
	);
}

export default WindowProviders;
