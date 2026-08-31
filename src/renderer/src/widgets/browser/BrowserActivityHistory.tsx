import { Alert, Image, Spin } from "antd";
import { useTranslation } from "react-i18next";
import { useBrowserActivity } from "@/features/external-browser/useBrowserActivity";

export default function BrowserActivityHistory({
	sessionId,
	activityId,
	renderDetail,
}: {
	sessionId: string;
	activityId: string;
	renderDetail(value: unknown): React.ReactNode;
}): React.JSX.Element | null {
	const { available, detail, loading, error } = useBrowserActivity(
		sessionId,
		activityId,
	);
	const { t } = useTranslation();
	if (!available) return null;
	if (loading) return <Spin />;
	if (error)
		return <Alert type="error" title={t("externalBrowser.unavailable")} />;
	if (!detail) return null;
	if (detail.detailLevel !== "full")
		return (
			<Alert
				type="info"
				title={t(
					detail.detailLevel === "compacted"
						? "trajectory.compacted"
						: "trajectory.hidden",
				)}
			/>
		);
	return (
		<>
			{detail.dataUrl && (
				<Image src={detail.dataUrl} alt={t("externalBrowser.evidence")} />
			)}
			{renderDetail(detail.detail ?? detail.summary)}
		</>
	);
}
