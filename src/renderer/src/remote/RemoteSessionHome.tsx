import { Button, Empty, Typography } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import remoteColorfulIconUrl from "@/assets/icons/remote-colorful.svg?url";
import { Icon } from "@/assets/icons";
import type { SessionMetadata, WorkspaceConfig } from "@/platform/rpc/types";
import { getNewSessionGreetingPeriod } from "@/widgets/home/surface/new-session-home-content";
import { getRecentRemoteSessions } from "./remote-model";
import styles from "./RemoteSessionHome.module.css";

type RemoteSessionHomeProps = {
	sessions: SessionMetadata[];
	workspaces: WorkspaceConfig[];
	activeSessionId?: string;
	onCreate: () => void;
	onOpenSession: (session: SessionMetadata) => void;
};

function formatUpdatedAt(value: string): string {
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));
}

function SessionRow({
	session,
	active,
	onOpen,
}: {
	session: SessionMetadata;
	active: boolean;
	onOpen: (session: SessionMetadata) => void;
}): React.JSX.Element {
	return (
		<button
			type="button"
			className={styles.sessionRow}
			aria-label={session.title}
			onClick={(): void => onOpen(session)}
		>
			<div className={styles.sessionRowContent}>
				<Typography.Text strong ellipsis>
					{session.title}
				</Typography.Text>
				<Typography.Text
					type="secondary"
					className={styles.sessionTimestamp}
				>
					{formatUpdatedAt(session.updatedAt)}
				</Typography.Text>
			</div>
			<span className={styles.sessionRowArrow} aria-hidden="true">
				<Icon name="arrow-right" />
			</span>
		</button>
	);
}

function RemoteSessionHome({
	sessions,
	workspaces,
	activeSessionId,
	onCreate,
	onOpenSession,
}: RemoteSessionHomeProps): React.JSX.Element {
	const { t } = useTranslation();
	const recentSessions: SessionMetadata[] = useMemo(
		(): SessionMetadata[] => getRecentRemoteSessions(sessions, 3),
		[sessions],
	);
	const greetingPeriod = getNewSessionGreetingPeriod(new Date().getHours());

	return (
		<section
			className={styles.sessionScreen}
			data-testid="remote-session-home"
		>
			<div className={styles.homeHero}>
				<img
					className={styles.welcomeIcon}
					src={remoteColorfulIconUrl}
					alt=""
					aria-hidden="true"
				/>
				<Typography.Title level={2} className={styles.homeGreeting}>
					{t(`app.home.greeting.${greetingPeriod}`)}
				</Typography.Title>
			</div>

			<section
				className={styles.homeSection}
				aria-labelledby="remote-recent-heading"
			>
				<Typography.Title
					id="remote-recent-heading"
					level={5}
					className={styles.sectionTitle}
				>
					{t("remote.home.recent")}
				</Typography.Title>
				{recentSessions.length > 0 ? (
					<div className={styles.recentScroller}>
						{recentSessions.map(
							(session: SessionMetadata): React.JSX.Element => (
								<SessionRow
									key={session.id}
									session={session}
									active={session.id === activeSessionId}
									onOpen={onOpenSession}
								/>
							),
						)}
					</div>
				) : (
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={t("remote.home.noRecentSessions")}
					/>
				)}
			</section>

			<section
				className={`${styles.homeSection} ${styles.newSessionSection}`}
			>
				<Button
					type="primary"
					size="large"
					block
					className={styles.newSessionAction}
					icon={<Icon name="add" />}
					disabled={workspaces.length === 0}
					onClick={onCreate}
				>
					{workspaces.length === 0
						? t("remote.noProjects")
						: t("remote.newSession")}
				</Button>
			</section>
		</section>
	);
}

export default RemoteSessionHome;
