import { Button, Collapse, Empty, Input, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { SessionMetadata, WorkspaceConfig } from "@/platform/rpc/types";
import {
	buildRemoteSessionGroups,
	getRecentRemoteSessions,
	type RemoteSessionGroup,
} from "./remote-model";
import styles from "./RemoteApp.module.css";

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
		<button type="button" className={styles.sessionRow} onClick={(): void => onOpen(session)}>
			<span className={styles.sessionRowIcon}><Icon name={active ? "agent" : "chat"} /></span>
			<span className={styles.sessionRowContent}>
				<Typography.Text strong ellipsis>{session.title}</Typography.Text>
				<Typography.Text type="secondary" className={styles.sessionTimestamp}>{formatUpdatedAt(session.updatedAt)}</Typography.Text>
			</span>
			<Icon name="arrow-right" />
		</button>
	);
}

function RemoteSessionHome({ sessions, workspaces, activeSessionId, onCreate, onOpenSession }: RemoteSessionHomeProps): React.JSX.Element {
	const { t } = useTranslation();
	const [query, setQuery] = useState<string>("");
	const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
	const groups: RemoteSessionGroup[] = useMemo(
		(): RemoteSessionGroup[] => buildRemoteSessionGroups(workspaces, sessions, query),
		[query, sessions, workspaces],
	);
	const recentSessions: SessionMetadata[] = useMemo((): SessionMetadata[] => getRecentRemoteSessions(sessions), [sessions]);
	const hasSearchResults: boolean = groups.some((group: RemoteSessionGroup): boolean => group.sessions.length > 0);

	useEffect((): void => {
		setExpandedProjects((current: string[]): string[] => current.length > 0
			? current.filter((workspaceId: string): boolean => workspaces.some((workspace: WorkspaceConfig): boolean => workspace.id === workspaceId))
			: workspaces.slice(0, 2).map((workspace: WorkspaceConfig): string => workspace.id));
	}, [workspaces]);

	return (
		<section className={styles.sessionScreen} data-testid="remote-session-home">
			<div className={styles.homeHero}>
				<div className={styles.homeHeroCopy}>
					<Typography.Text className={styles.homeEyebrow}>{t("remote.home.eyebrow")}</Typography.Text>
					<Typography.Title level={2}>{t("remote.home.title")}</Typography.Title>
					<Typography.Paragraph type="secondary">{t("remote.home.subtitle")}</Typography.Paragraph>
				</div>
				<Button
					type="primary"
					shape="circle"
					size="large"
					className={styles.createSessionButton}
					aria-label={t("remote.newSession")}
					icon={<Icon name="add" />}
					disabled={workspaces.length === 0}
					onClick={onCreate}
				/>
			</div>

			<Input
				allowClear
				prefix={<Icon name="search" />}
				className={styles.sessionSearch}
				value={query}
				placeholder={t("remote.home.searchPlaceholder")}
				onChange={(event): void => setQuery(event.target.value)}
			/>

			{query.length === 0 && recentSessions.length > 0 ? (
				<section className={styles.homeSection} aria-labelledby="remote-recent-heading">
					<Typography.Title id="remote-recent-heading" level={5} className={styles.sectionTitle}>{t("remote.home.recent")}</Typography.Title>
					<div className={styles.recentScroller}>
						{recentSessions.map((session: SessionMetadata): React.JSX.Element => (
							<button key={session.id} type="button" className={styles.recentCard} onClick={(): void => onOpenSession(session)}>
								<span className={styles.recentCardIcon}><Icon name={session.id === activeSessionId ? "agent" : "chat"} /></span>
								<Typography.Text strong ellipsis>{session.title}</Typography.Text>
								<Typography.Text type="secondary" className={styles.sessionTimestamp}>{formatUpdatedAt(session.updatedAt)}</Typography.Text>
							</button>
						))}
					</div>
				</section>
			) : null}

			<section className={styles.homeSection} aria-labelledby="remote-projects-heading">
				<Typography.Title id="remote-projects-heading" level={5} className={styles.sectionTitle}>{t("remote.home.projects")}</Typography.Title>
				{workspaces.length === 0 ? <Empty description={t("remote.noProjects")} /> : !hasSearchResults && query.length > 0 ? (
					<Empty description={t("remote.home.noSearchResults")} />
				) : (
					<Collapse
						className={styles.projectCollapse}
						bordered={false}
						activeKey={expandedProjects}
						onChange={(keys: string | string[]): void => setExpandedProjects(Array.isArray(keys) ? keys : [keys])}
						items={groups.map((group: RemoteSessionGroup) => ({
							key: group.workspace.id,
							label: <span className={styles.projectLabel}><Icon name="folder" /><span>{group.workspace.name}</span><Typography.Text type="secondary">{group.sessions.length}</Typography.Text></span>,
							children: group.sessions.length === 0
								? <Typography.Text type="secondary" className={styles.emptyGroup}>{t("remote.noSessions")}</Typography.Text>
								: <div className={styles.sessionRows}>{group.sessions.map((session: SessionMetadata): React.JSX.Element => <SessionRow key={session.id} session={session} active={session.id === activeSessionId} onOpen={onOpenSession} />)}</div>,
						}))}
					/>
				)}
			</section>
		</section>
	);
}

export default RemoteSessionHome;
