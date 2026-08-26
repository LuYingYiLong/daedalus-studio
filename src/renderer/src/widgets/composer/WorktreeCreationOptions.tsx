import { App, Button, Modal, Select, Space, Spin, Typography } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import { getEnvironmentConfig } from "@/platform/rpc/environment-api";
import { listWorkspaceGitBranches } from "@/platform/rpc/workspace-git-api";
import type {
	WorktreeStartingState,
	WorkspaceConfig,
} from "@/platform/rpc/types";

export type WorktreeSourceOptions = {
	startingState?: WorktreeStartingState;
	environmentId?: string | null;
	environmentFingerprint?: string | null;
};

type Props = {
	workspace: WorkspaceConfig;
	value: Record<string, WorktreeSourceOptions>;
	disabled?: boolean;
	onChange: (value: Record<string, WorktreeSourceOptions>) => void;
};

function WorktreeCreationOptions({
	workspace,
	value,
	disabled = false,
	onChange,
}: Props): React.JSX.Element {
	const { t } = useTranslation();
	const { message } = App.useApp();
	const [open, setOpen] = useState<boolean>(false);
	const [loading, setLoading] = useState<boolean>(false);
	const [draft, setDraft] =
		useState<Record<string, WorktreeSourceOptions>>(value);
	const [environments, setEnvironments] = useState<
		Record<
			string,
			Array<{
				id: string;
				name: string;
				fingerprint: string;
				trust: string;
			}>
		>
	>({});
	const [branches, setBranches] = useState<Record<string, string[]>>({});

	useEffect((): void => {
		setDraft(value);
	}, [value]);

	async function show(): Promise<void> {
		setOpen(true);
		setLoading(true);
		try {
			const entries = await Promise.all(
				workspace.sourceFolders.map(async (source) => {
					const [document, branchResult] = await Promise.all([
						getEnvironmentConfig(workspace.id, source.id),
						listWorkspaceGitBranches({
							workspaceId: workspace.id,
							sourceFolderId: source.id,
						}),
					]);
					return {
						sourceId: source.id,
						document,
						branches: branchResult.branches.map(
							(branch) => branch.name,
						),
					};
				}),
			);
			setEnvironments(
				Object.fromEntries(
					entries.map((entry) => [
						entry.sourceId,
						entry.document.profiles.map((profile) => ({
							id: profile.id,
							name: profile.name,
							fingerprint: profile.fingerprint,
							trust: profile.trust,
						})),
					]),
				),
			);
			setBranches(
				Object.fromEntries(
					entries.map((entry) => [entry.sourceId, entry.branches]),
				),
			);
			setDraft((current) => {
				const next = { ...current };
				for (const entry of entries) {
					if (next[entry.sourceId] === undefined) {
						const defaultId =
							entry.document.config.defaultEnvironmentId ?? null;
						const profile = entry.document.profiles.find(
							(candidate) => candidate.id === defaultId,
						);
						next[entry.sourceId] = {
							startingState: { type: "head" },
							environmentId: defaultId,
							environmentFingerprint:
								profile?.fingerprint ?? null,
						};
					}
				}
				return next;
			});
		} catch (error: unknown) {
			message.error(
				error instanceof Error
					? error.message
					: t("composer.worktree.options.loadFailed"),
			);
		} finally {
			setLoading(false);
		}
	}

	return (
		<>
			<Button
				type="text"
				disabled={disabled}
				icon={<Icon name="settings" />}
				onClick={(): void => {
					void show();
				}}
			>
				{t("composer.worktree.options.button")}
			</Button>
			<Modal
				open={open}
				title={t("composer.worktree.options.title")}
				okText={t("settings.common.save")}
				onCancel={(): void => setOpen(false)}
				onOk={(): void => {
					onChange(draft);
					setOpen(false);
				}}
			>
				{loading ? (
					<Spin />
				) : (
					<Space orientation="vertical" style={{ width: "100%" }}>
						{workspace.sourceFolders.map((source) => {
							const current = draft[source.id] ?? {
								startingState: {
									type: "head",
								} as WorktreeStartingState,
								environmentId: null,
							};
							const start = current.startingState ?? {
								type: "head",
							};
							const startValue =
								start.type === "branch"
									? `branch:${start.ref}`
									: start.type;
							return (
								<div key={source.id}>
									<Typography.Text strong>
										{source.path}
									</Typography.Text>
									<Space
										direction="vertical"
										style={{ width: "100%", marginTop: 8 }}
									>
										<Select
											style={{ width: "100%" }}
											value={startValue}
											options={[
												{
													value: "head",
													label: t(
														"composer.worktree.options.head",
													),
												},
												{
													value: "working-tree",
													label: t(
														"composer.worktree.options.workingTree",
													),
												},
												...(
													branches[source.id] ?? []
												).map((branch) => ({
													value: `branch:${branch}`,
													label: `${t("composer.worktree.options.branch")}: ${branch}`,
												})),
											]}
											onChange={(selected): void =>
												setDraft((state) => ({
													...state,
													[source.id]: {
														...state[source.id],
														startingState:
															selected.startsWith(
																"branch:",
															)
																? {
																		type: "branch",
																		ref: selected.slice(
																			7,
																		),
																	}
																: {
																		type: selected as
																			| "head"
																			| "working-tree",
																	},
													},
												}))
											}
										/>
										<Select
											allowClear
											style={{ width: "100%" }}
											value={
												current.environmentId ??
												undefined
											}
											placeholder={t(
												"composer.worktree.options.environment",
											)}
											options={(
												environments[source.id] ?? []
											).map((profile) => ({
												value: profile.id,
												label: `${profile.name}${profile.trust === "review-required" ? ` · ${t("composer.worktree.options.reviewRequired")}` : ""}`,
											}))}
											onChange={(environmentId): void => {
												const profile = environments[
													source.id
												]?.find(
													(candidate) =>
														candidate.id ===
														environmentId,
												);
												setDraft((state) => ({
													...state,
													[source.id]: {
														...state[source.id],
														environmentId:
															environmentId ??
															null,
														environmentFingerprint:
															profile?.fingerprint ??
															null,
													},
												}));
											}}
										/>
									</Space>
								</div>
							);
						})}
					</Space>
				)}
			</Modal>
		</>
	);
}

export default WorktreeCreationOptions;
