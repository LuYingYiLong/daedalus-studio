import {
	Alert,
	App as AntdApp,
	Button,
	Empty,
	Flex,
	Form,
	Input,
	Progress,
	Result,
	Select,
	Space,
	Steps,
	Switch,
	Table,
	Tag,
	Typography,
	type TableProps
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	discoverProviderModels,
	fetchProviderModelSelection,
	importProviderModels,
	saveProviderConfig,
	type DiscoveredProviderModel,
	type ProviderModelInfo,
	type ProviderModelSelection,
	type ProviderModelSelectionProvider
} from "@/platform/rpc/provider-api";
import { updateGeneralSettings, type GeneralSettings } from "@/platform/rpc/general-settings-api";
import {
	cancelGodotDocumentationJob,
	fetchGodotDocumentation,
	fetchGodotDocumentationBranches,
	fetchGodotDocumentationJob,
	installGodotDocumentation,
	setGodotDocumentationEnabled,
	type GodotDocumentationBranch,
	type GodotDocumentationJob,
	type GodotDocumentationRecord,
	type GodotDocumentationState
} from "@/platform/rpc/godot-documentation-api";
import {
	updateClientPreferences,
	type ClientPreferences
} from "@/platform/rpc/client-preferences-api";
import { Icon } from "@/assets/icons";
import daedalusColorfulIconUrl from "@/assets/icons/icon-colorful.svg";
import {
	ONBOARDING_STEP_IDS,
	createDefaultOnboardingPreferences,
	isOnboardingPreferences,
	type OnboardingConfigurableStepId,
	type OnboardingPreferences,
	type OnboardingStepId,
	type OnboardingStepOutcome
} from "../../../../contracts/onboarding";
import type { BootstrapData } from "../bootstrap/bootstrap";
import styles from "./OnboardingWizard.module.css";

type OnboardingWizardProps = {
	bootstrapData: BootstrapData;
	onComplete: (bootstrapData: BootstrapData) => void;
};

type ProviderStepProps = {
	selection: ProviderModelSelection;
	onSelectionChange: (selection: ProviderModelSelection) => void;
};

type GodotExecutableStepProps = {
	settings: GeneralSettings;
	onSettingsChange: (settings: GeneralSettings) => void;
};

type DocumentationStepProps = {
	godotVersion: string | null;
	onConfiguredChange: (configured: boolean) => void;
	onBusyChange: (busy: boolean) => void;
};

type GodotPluginStepProps = {
	onConfiguredChange: (configured: boolean) => void;
	onBusyChange: (busy: boolean) => void;
};

const CONFIGURABLE_STEPS: readonly OnboardingConfigurableStepId[] = [
	"provider",
	"godot_executable",
	"documentation",
	"godot_plugin"
];

const TERMINAL_DOCUMENTATION_JOB_STAGES: ReadonlySet<GodotDocumentationJob["stage"]> = new Set([
	"completed",
	"failed",
	"cancelled"
]);

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

function isProviderConfigured(selection: ProviderModelSelection): boolean {
	return selection.providers.some((provider: ProviderModelSelectionProvider): boolean => {
		const selectedModel: string | null = provider.selectedModel ?? provider.defaultModel;
		return provider.selected && provider.configured && provider.ready && selectedModel !== null;
	});
}

function isDocumentationConfigured(state: GodotDocumentationState | null): boolean {
	return state?.enabled === true
		&& state.documents.some((document: GodotDocumentationRecord): boolean => document.health.status === "ready");
}

function isGodotProjectConfigured(project: GodotProjectInfo): boolean {
	return project.status === "current" || project.status === "development" || project.status === "pending_restart";
}

function hasConfiguredGodotProject(result: GodotProjectScanResult | null): boolean {
	return result?.projects.some(isGodotProjectConfigured) ?? false;
}

function isGodotVersionCompatible(version: string | null): boolean {
	if (version === null) {
		return true;
	}
	const match: RegExpMatchArray | null = version.match(/^(\d+)\.(\d+)/);
	if (match === null) {
		return true;
	}
	const major: number = Number(match[1]);
	const minor: number = Number(match[2]);
	return major > 4 || (major === 4 && minor >= 5);
}

function getProjectStatusColor(status: GodotProjectPluginStatus): string {
	if (status === "current") return "success";
	if (status === "development") return "processing";
	if (status === "pending" || status === "pending_restart" || status === "outdated" || status === "modified") return "warning";
	if (status === "failed") return "error";
	return "default";
}

function ProviderOnboardingStep({ selection, onSelectionChange }: ProviderStepProps): React.JSX.Element {
	const { t } = useTranslation();
	const { message } = AntdApp.useApp();
	const [providerId, setProviderId] = useState<string>(selection.current.provider);
	const [apiKey, setApiKey] = useState<string>("");
	const [baseUrl, setBaseUrl] = useState<string>("");
	const [modelId, setModelId] = useState<string | null>(null);
	const [discoveredModels, setDiscoveredModels] = useState<DiscoveredProviderModel[]>([]);
	const [testedProviderId, setTestedProviderId] = useState<string | null>(null);
	const [testing, setTesting] = useState<boolean>(false);
	const [saving, setSaving] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	const provider: ProviderModelSelectionProvider | null = useMemo((): ProviderModelSelectionProvider | null => {
		return selection.providers.find((item: ProviderModelSelectionProvider): boolean => item.provider === providerId)
			?? selection.providers[0]
			?? null;
	}, [providerId, selection.providers]);

	useEffect((): void => {
		if (provider === null) {
			return;
		}
		setProviderId(provider.provider);
		setBaseUrl(provider.baseUrl);
		setApiKey("");
		setDiscoveredModels([]);
		setTestedProviderId(null);
		setModelId(provider.selectedModel ?? provider.defaultModel ?? provider.models[0]?.id ?? null);
		setError(null);
	}, [provider?.provider]);

	const availableModels: Array<ProviderModelInfo | DiscoveredProviderModel> = discoveredModels.length > 0
		? discoveredModels
		: provider?.models ?? [];
	const credentialsChanged: boolean = provider !== null
		&& (apiKey.trim().length > 0 || baseUrl.trim() !== provider.baseUrl.trim());
	const needsConnectionTest: boolean = provider !== null && (!provider.configured || credentialsChanged);
	const canSave: boolean = provider !== null
		&& modelId !== null
		&& (!needsConnectionTest || testedProviderId === provider.provider);

	async function testConnection(): Promise<void> {
		if (provider === null) return;
		setTesting(true);
		setError(null);
		try {
			const discovery = await discoverProviderModels({
				provider: provider.provider,
				...(apiKey.trim().length > 0 ? { apiKey: apiKey.trim() } : {}),
				baseUrl: baseUrl.trim().length > 0 ? baseUrl.trim() : null
			});
			if (discovery.source !== "api" || discovery.error !== undefined) {
				throw new Error(discovery.error ?? t("onboarding.provider.errors.test"));
			}
			const nextSelection: ProviderModelSelection = await saveProviderConfig({
				provider: provider.provider,
				...(apiKey.trim().length > 0 ? { apiKey: apiKey.trim() } : {}),
				baseUrl: baseUrl.trim().length > 0 ? baseUrl.trim() : null,
				activate: false
			});
			onSelectionChange(nextSelection);
			setDiscoveredModels(discovery.models);
			setTestedProviderId(provider.provider);
			setApiKey("");
			setModelId((current: string | null): string | null => {
				if (current !== null && discovery.models.some((model: DiscoveredProviderModel): boolean => model.id === current)) {
					return current;
				}
				return discovery.models[0]?.id ?? provider.selectedModel ?? provider.defaultModel;
			});
			void message.success(t("onboarding.provider.testSucceeded"));
		} catch (connectionError: unknown) {
			setTestedProviderId(null);
			setError(getErrorMessage(connectionError, t("onboarding.provider.errors.test")));
		} finally {
			setTesting(false);
		}
	}

	async function saveAndActivate(): Promise<void> {
		if (provider === null || modelId === null) return;
		setSaving(true);
		setError(null);
		try {
			const discoveredModel: DiscoveredProviderModel | undefined = discoveredModels.find(
				(model: DiscoveredProviderModel): boolean => model.id === modelId
			);
			if (discoveredModel !== undefined) {
				await importProviderModels({ provider: provider.provider, models: [discoveredModel] });
			}
			const nextSelection: ProviderModelSelection = await saveProviderConfig({
				provider: provider.provider,
				model: modelId,
				baseUrl: baseUrl.trim().length > 0 ? baseUrl.trim() : null,
				activate: true
			});
			onSelectionChange(nextSelection);
			void message.success(t("onboarding.provider.saved"));
		} catch (saveError: unknown) {
			setError(getErrorMessage(saveError, t("onboarding.provider.errors.save")));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className={styles.stepContent}>
			<div className={styles.stepHeading}>
				<Icon name="cloud" className={styles.stepIcon} />
				<div>
					<Typography.Title level={2}>{t("onboarding.provider.title")}</Typography.Title>
					<Typography.Paragraph type="secondary">{t("onboarding.provider.description")}</Typography.Paragraph>
				</div>
			</div>
			{isProviderConfigured(selection) ? <Alert showIcon type="success" title={t("onboarding.provider.existingReady")} /> : null}
			{error !== null ? <Alert showIcon type="error" description={error} /> : null}
			<Form layout="vertical" className={styles.form}>
				<Form.Item label={t("onboarding.provider.fields.provider")}>
					<Select
						value={provider?.provider}
						options={selection.providers.map((item: ProviderModelSelectionProvider) => ({
							value: item.provider,
							label: item.displayName
						}))}
						onChange={setProviderId}
						suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}
					/>
				</Form.Item>
				<Form.Item label={t("onboarding.provider.fields.apiKey")}>
					<Input.Password
						value={apiKey}
						placeholder={provider?.apiKeyMasked ?? t("onboarding.provider.fields.apiKeyPlaceholder")}
						onChange={(event): void => {
							setApiKey(event.target.value);
							setTestedProviderId(null);
						}}
					/>
				</Form.Item>
				<Form.Item label={t("onboarding.provider.fields.baseUrl")}>
					<Input
						value={baseUrl}
						onChange={(event): void => {
							setBaseUrl(event.target.value);
							setTestedProviderId(null);
						}}
					/>
				</Form.Item>
				<Flex align="end" gap="small" wrap>
					<Form.Item label={t("onboarding.provider.fields.model")} className={styles.growingField}>
						<Select
							showSearch={true}
							value={modelId}
							placeholder={t("onboarding.provider.fields.modelPlaceholder")}
							options={availableModels.map((model) => ({ value: model.id, label: model.displayName }))}
							onChange={setModelId}
							suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}
						/>
					</Form.Item>
					<Form.Item>
						<Space>
							<Button loading={testing} disabled={provider === null || saving} onClick={(): void => { void testConnection(); }}>
								{t("onboarding.provider.actions.test")}
							</Button>
							<Button type="primary" loading={saving} disabled={!canSave || testing} onClick={(): void => { void saveAndActivate(); }}>
								{t("onboarding.provider.actions.save")}
							</Button>
						</Space>
					</Form.Item>
				</Flex>
			</Form>
		</div>
	);
}

function GodotExecutableOnboardingStep({ settings, onSettingsChange }: GodotExecutableStepProps): React.JSX.Element {
	const { t } = useTranslation();
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	async function chooseExecutable(): Promise<void> {
		setLoading(true);
		setError(null);
		try {
			const path: string | null = await window.electronAPI.pickGodotExecutable();
			if (path === null) return;
			const nextSettings: GeneralSettings = await updateGeneralSettings({ godotExecutablePath: path });
			onSettingsChange(nextSettings);
			if (nextSettings.godotExecutableStatus !== "ready") {
				setError(nextSettings.godotExecutableError ?? t("onboarding.godotExecutable.errors.invalid"));
			}
		} catch (chooseError: unknown) {
			setError(getErrorMessage(chooseError, t("onboarding.godotExecutable.errors.select")));
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className={styles.stepContent}>
			<div className={styles.stepHeading}>
				<Icon name="godot" className={styles.stepIcon} />
				<div>
					<Typography.Title level={2}>{t("onboarding.godotExecutable.title")}</Typography.Title>
					<Typography.Paragraph type="secondary">{t("onboarding.godotExecutable.description")}</Typography.Paragraph>
				</div>
			</div>
			{settings.godotExecutableStatus === "ready" ? (
				<Alert showIcon type="success" title={t("onboarding.godotExecutable.ready", { version: settings.godotExecutableVersion })} />
			) : null}
			{error !== null ? <Alert showIcon type="error" description={error} /> : null}
			<div className={styles.settingRow}>
				<div className={styles.settingDescription}>
					<Typography.Text strong>{t("onboarding.godotExecutable.path")}</Typography.Text>
					<Typography.Text type="secondary" ellipsis={{ tooltip: settings.godotExecutablePath ?? undefined }}>
						{settings.godotExecutablePath ?? t("onboarding.godotExecutable.notSelected")}
					</Typography.Text>
				</div>
				<Button icon={<Icon name="folder-open" />} loading={loading} onClick={(): void => { void chooseExecutable(); }}>
					{t("onboarding.godotExecutable.actions.select")}
				</Button>
			</div>
		</div>
	);
}

function DocumentationOnboardingStep({ godotVersion, onConfiguredChange, onBusyChange }: DocumentationStepProps): React.JSX.Element {
	const { t } = useTranslation();
	const [documentation, setDocumentation] = useState<GodotDocumentationState | null>(null);
	const [branches, setBranches] = useState<GodotDocumentationBranch[]>([]);
	const [recommendedBranch, setRecommendedBranch] = useState<string | null>(null);
	const [branch, setBranch] = useState<string | null>(null);
	const [job, setJob] = useState<GodotDocumentationJob | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [toggling, setToggling] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [branchListWarning, setBranchListWarning] = useState<string | null>(null);

	const loadDocumentation = useCallback(async (): Promise<GodotDocumentationState> => {
		const nextState: GodotDocumentationState = await fetchGodotDocumentation();
		setDocumentation(nextState);
		setJob(nextState.activeJob ?? null);
		return nextState;
	}, []);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		void Promise.all([loadDocumentation(), fetchGodotDocumentationBranches(false)])
			.then(([, branchList]): void => {
				if (cancelled) return;
				setBranches(Array.isArray(branchList.branches) ? branchList.branches : []);
				setRecommendedBranch(branchList.recommendedBranch);
				setBranchListWarning(branchList.error ?? null);
			})
			.catch((loadError: unknown): void => {
				console.error("[Onboarding] documentation bootstrap failed", loadError);
				if (!cancelled) setError(getErrorMessage(loadError, t("onboarding.documentation.errors.load")));
			})
			.finally((): void => {
				if (!cancelled) setLoading(false);
			});
		return (): void => { cancelled = true; };
	}, [loadDocumentation, t]);

	useEffect((): void => {
		if (branch !== null || branches.length === 0) return;
		const versionMatch: string | null = godotVersion?.match(/^(\d+\.\d+)/)?.[1] ?? null;
		const selected: GodotDocumentationBranch | undefined = branches.find((item): boolean => !item.installed && item.name === versionMatch)
			?? branches.find((item): boolean => !item.installed && item.name === recommendedBranch)
			?? branches.find((item): boolean => !item.installed);
		setBranch(selected?.name ?? null);
	}, [branch, branches, godotVersion, recommendedBranch]);

	const busy: boolean = job !== null && !TERMINAL_DOCUMENTATION_JOB_STAGES.has(job.stage);
	useEffect((): void => onBusyChange(busy), [busy, onBusyChange]);
	useEffect((): void => onConfiguredChange(isDocumentationConfigured(documentation)), [documentation, onConfiguredChange]);

	useEffect((): (() => void) | void => {
		if (!busy || job === null) return;
		const timer: number = window.setTimeout((): void => {
			void fetchGodotDocumentationJob(job.jobId).then((nextJob: GodotDocumentationJob | null): void => {
				const normalizedJob: GodotDocumentationJob | null = nextJob ?? null;
				setJob(normalizedJob);
				if (normalizedJob === null) return;
				if (TERMINAL_DOCUMENTATION_JOB_STAGES.has(normalizedJob.stage)) {
					void loadDocumentation();
					if (normalizedJob.stage === "failed") setError(normalizedJob.error ?? normalizedJob.message);
				}
			}).catch((pollError: unknown): void => setError(getErrorMessage(pollError, t("onboarding.documentation.errors.job"))));
		}, 600);
		return (): void => window.clearTimeout(timer);
	}, [busy, job, loadDocumentation, t]);

	async function startInstall(): Promise<void> {
		if (branch === null) return;
		setError(null);
		try {
			setJob((await installGodotDocumentation(branch)) ?? null);
		} catch (installError: unknown) {
			setError(getErrorMessage(installError, t("onboarding.documentation.errors.install")));
		}
	}

	async function cancelJob(): Promise<void> {
		if (job === null || !busy) return;
		try {
			setJob((await cancelGodotDocumentationJob(job.jobId)) ?? null);
		} catch (cancelError: unknown) {
			setError(getErrorMessage(cancelError, t("onboarding.documentation.errors.cancel")));
		}
	}

	async function toggleEnabled(enabled: boolean): Promise<void> {
		setToggling(true);
		setError(null);
		try {
			setDocumentation(await setGodotDocumentationEnabled(enabled));
		} catch (toggleError: unknown) {
			setError(getErrorMessage(toggleError, t("onboarding.documentation.errors.toggle")));
		} finally {
			setToggling(false);
		}
	}

	const readyDocuments: GodotDocumentationRecord[] = documentation?.documents.filter(
		(document: GodotDocumentationRecord): boolean => document.health.status === "ready"
	) ?? [];

	return (
		<div className={styles.stepContent}>
			<div className={styles.stepHeading}>
				<Icon name="book" className={styles.stepIcon} />
				<div>
					<Typography.Title level={2}>{t("onboarding.documentation.title")}</Typography.Title>
					<Typography.Paragraph type="secondary">{t("onboarding.documentation.description")}</Typography.Paragraph>
				</div>
			</div>
			{isDocumentationConfigured(documentation) ? <Alert showIcon type="success" title={t("onboarding.documentation.ready")} /> : null}
			{branchListWarning !== null ? <Alert showIcon type="warning" description={branchListWarning} /> : null}
			{error !== null ? <Alert showIcon type="error" description={error} /> : null}
			{readyDocuments.length > 0 ? (
				<div className={styles.settingRow}>
					<div className={styles.settingDescription}>
						<Typography.Text strong>{t("onboarding.documentation.installed", { count: readyDocuments.length })}</Typography.Text>
						<Typography.Text type="secondary">{readyDocuments.map((document) => `Godot ${document.branch}`).join(", ")}</Typography.Text>
					</div>
					<Space>
						<Typography.Text>{t("onboarding.documentation.enableSearch")}</Typography.Text>
						<Switch checked={documentation?.enabled ?? false} loading={toggling} onChange={(checked): void => { void toggleEnabled(checked); }} />
					</Space>
				</div>
			) : null}
			{busy && job !== null ? (
				<div className={styles.progressPanel}>
					<Flex justify="space-between" align="center" gap="small">
						<Typography.Text strong>{t(`onboarding.documentation.stages.${job.stage}`)}</Typography.Text>
						<Button size="small" onClick={(): void => { void cancelJob(); }}>{t("onboarding.actions.cancel")}</Button>
					</Flex>
					<Progress percent={job.progress ?? 0} status="active" />
					<Typography.Text type="secondary">{job.message}</Typography.Text>
				</div>
			) : (
				<Flex align="end" gap="small" wrap>
					<Form.Item label={t("onboarding.documentation.branch")} className={styles.growingField}>
						<Select
							loading={loading}
							showSearch={true}
							value={branch}
							placeholder={t("onboarding.documentation.selectBranch")}
							options={branches.map((item) => ({
								value: item.name,
								label: item.name,
								disabled: item.installed
							}))}
							onChange={setBranch}
							suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}
						/>
					</Form.Item>
					<Form.Item>
						<Button type="primary" icon={<Icon name="download" />} disabled={branch === null} onClick={(): void => { void startInstall(); }}>
							{t("onboarding.documentation.install")}
						</Button>
					</Form.Item>
				</Flex>
			)}
		</div>
	);
}

function GodotPluginOnboardingStep({ onConfiguredChange, onBusyChange }: GodotPluginStepProps): React.JSX.Element {
	const { t } = useTranslation();
	const [result, setResult] = useState<GodotProjectScanResult | null>(null);
	const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);
	const [loading, setLoading] = useState<boolean>(true);
	const [busy, setBusy] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	const loadProjects = useCallback(async (): Promise<void> => {
		setLoading(true);
		setError(null);
		try {
			setResult(await window.electronAPI.godotProjects.scan());
		} catch (scanError: unknown) {
			setError(getErrorMessage(scanError, t("onboarding.godotPlugin.errors.scan")));
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect((): void => { void loadProjects(); }, [loadProjects]);
	useEffect((): void => onBusyChange(busy), [busy, onBusyChange]);
	useEffect((): void => onConfiguredChange(hasConfiguredGodotProject(result)), [onConfiguredChange, result]);

	async function addProject(): Promise<void> {
		setBusy(true);
		setError(null);
		try {
			setResult(await window.electronAPI.godotProjects.add());
		} catch (addError: unknown) {
			setError(getErrorMessage(addError, t("onboarding.godotPlugin.errors.add")));
		} finally {
			setBusy(false);
		}
	}

	async function installSelected(): Promise<void> {
		if (result === null || selectedIds.length === 0) return;
		setBusy(true);
		setError(null);
		const failures: string[] = [];
		let nextResult: GodotProjectScanResult = result;
		for (const projectId of selectedIds.map(String)) {
			const project: GodotProjectInfo | undefined = nextResult.projects.find((item): boolean => item.id === projectId)
				?? result.projects.find((item): boolean => item.id === projectId);
			if (project === undefined) continue;
			try {
				if (project.status === "modified" || project.status === "failed") {
					nextResult = await window.electronAPI.godotProjects.repair(project.path);
				} else if (project.status === "disabled") {
					nextResult = await window.electronAPI.godotProjects.setEnabled(project.path, true);
				} else {
					nextResult = await window.electronAPI.godotProjects.install(project.path);
				}
				setResult(nextResult);
			} catch (installError: unknown) {
				failures.push(`${project.name}: ${getErrorMessage(installError, t("onboarding.godotPlugin.errors.install"))}`);
			}
		}
		setSelectedIds([]);
		try {
			setResult(await window.electronAPI.godotProjects.scan());
		} catch {
			setResult(nextResult);
		}
		if (failures.length > 0) setError(failures.join("\n"));
		setBusy(false);
	}

	const columns: TableProps<GodotProjectInfo>["columns"] = [
		{
			title: t("onboarding.godotPlugin.columns.project"),
			key: "project",
			render: (_value, project): React.JSX.Element => (
				<div className={styles.projectCell}>
					<Typography.Text strong ellipsis={{ tooltip: project.name }}>{project.name}</Typography.Text>
					<Typography.Text type="secondary" ellipsis={{ tooltip: project.path }}>{project.path}</Typography.Text>
				</div>
			)
		},
		{
			title: t("onboarding.godotPlugin.columns.godot"),
			dataIndex: "godotVersion",
			width: 100,
			render: (value: string | null): React.ReactNode => value ?? "-"
		},
		{
			title: t("onboarding.godotPlugin.columns.status"),
			key: "status",
			width: 160,
			render: (_value, project): React.JSX.Element => (
				<div className={styles.projectCell}>
					<Tag color={getProjectStatusColor(project.status)}>{t(`settings.godotProjects.status.${project.status}`)}</Tag>
					{!isGodotVersionCompatible(project.godotVersion) ? (
						<Typography.Text type="danger">{t("onboarding.godotPlugin.incompatible")}</Typography.Text>
					) : null}
				</div>
			)
		}
	];

	return (
		<div className={styles.stepContentWide}>
			<div className={styles.stepHeading}>
				<Icon name="godot" className={styles.stepIcon} />
				<div>
					<Typography.Title level={2}>{t("onboarding.godotPlugin.title")}</Typography.Title>
					<Typography.Paragraph type="secondary">{t("onboarding.godotPlugin.description")}</Typography.Paragraph>
				</div>
			</div>
			{hasConfiguredGodotProject(result) ? <Alert showIcon type="success" title={t("onboarding.godotPlugin.ready")} /> : null}
			{result?.plugin.errorMessage ? <Alert showIcon type="error" description={result.plugin.errorMessage} /> : null}
			{result?.projects.some((project): boolean => project.status === "pending_restart") ? (
				<Alert showIcon type="warning" title={t("onboarding.godotPlugin.pendingRestart")} />
			) : null}
			{error !== null ? <Alert showIcon type="error" description={<span className={styles.multilineError}>{error}</span>} /> : null}
			<Flex justify="space-between" align="center" gap="small" wrap>
				<Typography.Text type="secondary">{t("onboarding.godotPlugin.selected", { count: selectedIds.length })}</Typography.Text>
				<Space>
					<Button icon={<Icon name="reload" />} loading={loading} disabled={busy} onClick={(): void => { void loadProjects(); }}>
						{t("onboarding.godotPlugin.actions.scan")}
					</Button>
					<Button icon={<Icon name="add" />} disabled={busy} onClick={(): void => { void addProject(); }}>
						{t("onboarding.godotPlugin.actions.add")}
					</Button>
					<Button type="primary" loading={busy} disabled={selectedIds.length === 0 || !result?.plugin.available} onClick={(): void => { void installSelected(); }}>
						{t("onboarding.godotPlugin.actions.install")}
					</Button>
				</Space>
			</Flex>
			<Table<GodotProjectInfo>
				rowKey="id"
				size="small"
				loading={loading}
				columns={columns}
				dataSource={result?.projects ?? []}
				pagination={false}
				rowSelection={{
					selectedRowKeys: selectedIds,
					onChange: setSelectedIds,
					getCheckboxProps: (project: GodotProjectInfo) => ({
						disabled: busy
							|| isGodotProjectConfigured(project)
							|| !isGodotVersionCompatible(project.godotVersion)
							|| result?.plugin.available !== true
					})
				}}
				locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("onboarding.godotPlugin.empty")} /> }}
			/>
		</div>
	);
}

function OnboardingWizard({ bootstrapData, onComplete }: OnboardingWizardProps): React.JSX.Element {
	const { t } = useTranslation();
	const [preferences, setPreferences] = useState<ClientPreferences>(() => ({
		...bootstrapData.clientPreferences,
		onboarding: isOnboardingPreferences(bootstrapData.clientPreferences.onboarding)
			? bootstrapData.clientPreferences.onboarding
			: createDefaultOnboardingPreferences()
	}));
	const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(bootstrapData.generalSettings);
	const [providerSelection, setProviderSelection] = useState<ProviderModelSelection>(bootstrapData.providerModelSelection);
	const [documentationConfigured, setDocumentationConfigured] = useState<boolean>(false);
	const [pluginConfigured, setPluginConfigured] = useState<boolean>(false);
	const [documentationBusy, setDocumentationBusy] = useState<boolean>(false);
	const [pluginBusy, setPluginBusy] = useState<boolean>(false);
	const [savingNavigation, setSavingNavigation] = useState<boolean>(false);
	const [navigationError, setNavigationError] = useState<string | null>(null);

	const currentStep: OnboardingStepId = preferences.onboarding.currentStep;
	const currentIndex: number = Math.max(0, ONBOARDING_STEP_IDS.indexOf(currentStep));
	const configuredByStep: Record<OnboardingConfigurableStepId, boolean> = {
		provider: isProviderConfigured(providerSelection),
		godot_executable: generalSettings.godotExecutableStatus === "ready",
		documentation: documentationConfigured,
		godot_plugin: pluginConfigured
	};
	const activeOperation: boolean = documentationBusy || pluginBusy;

	const stepItems = ONBOARDING_STEP_IDS.map((stepId: OnboardingStepId) => ({
		title: t(`onboarding.steps.${stepId}`)
	}));

	async function persistStep(step: OnboardingStepId, outcome?: OnboardingStepOutcome): Promise<ClientPreferences> {
		setSavingNavigation(true);
		setNavigationError(null);
		try {
			const stepOutcomes: OnboardingPreferences["stepOutcomes"] = {
				...preferences.onboarding.stepOutcomes
			};
			if (outcome !== undefined && CONFIGURABLE_STEPS.includes(currentStep as OnboardingConfigurableStepId)) {
				stepOutcomes[currentStep as OnboardingConfigurableStepId] = outcome;
			}
			const nextPreferences: ClientPreferences = await updateClientPreferences({
				onboarding: {
					...preferences.onboarding,
					completed: false,
					currentStep: step,
					stepOutcomes,
					completedAt: null
				}
			});
			setPreferences(nextPreferences);
			return nextPreferences;
		} catch (error: unknown) {
			console.error("[Onboarding] persist step failed", { currentStep, step, outcome, error });
			setNavigationError(getErrorMessage(error, t("onboarding.errors.saveProgress")));
			throw error;
		} finally {
			setSavingNavigation(false);
		}
	}

	async function goForward(outcome?: OnboardingStepOutcome): Promise<void> {
		const nextStep: OnboardingStepId = ONBOARDING_STEP_IDS[Math.min(currentIndex + 1, ONBOARDING_STEP_IDS.length - 1)];
		await persistStep(nextStep, outcome).catch((): void => {});
	}

	async function goBack(): Promise<void> {
		const previousStep: OnboardingStepId = ONBOARDING_STEP_IDS[Math.max(0, currentIndex - 1)];
		await persistStep(previousStep).catch((): void => {});
	}

	async function finish(): Promise<void> {
		setSavingNavigation(true);
		setNavigationError(null);
		try {
			const nextPreferences: ClientPreferences = await updateClientPreferences({
				onboarding: {
					...preferences.onboarding,
					completed: true,
					currentStep: "complete",
					completedAt: new Date().toISOString()
				}
			});
			onComplete({
				...bootstrapData,
				clientPreferences: nextPreferences,
				generalSettings,
				providerModelSelection: providerSelection
			});
		} catch (error: unknown) {
			setNavigationError(getErrorMessage(error, t("onboarding.errors.complete")));
		} finally {
			setSavingNavigation(false);
		}
	}

	function getSummaryOutcome(step: OnboardingConfigurableStepId): OnboardingStepOutcome {
		return configuredByStep[step] ? "configured" : preferences.onboarding.stepOutcomes[step] ?? "skipped";
	}

	let content: React.ReactNode;
	if (currentStep === "welcome") {
		content = (
			<div className={styles.welcome}>
				<img src={daedalusColorfulIconUrl} alt="" className={styles.logo} />
				<Typography.Title>{t("onboarding.welcome.title")}</Typography.Title>
				<Typography.Paragraph type="secondary" className={styles.welcomeDescription}>
					{t("onboarding.welcome.description")}
				</Typography.Paragraph>
				<Space wrap className={styles.featureTags}>
					<Tag>{t("onboarding.welcome.features.agent")}</Tag>
					<Tag>{t("onboarding.welcome.features.godot")}</Tag>
					<Tag>{t("onboarding.welcome.features.documentation")}</Tag>
				</Space>
			</div>
		);
	} else if (currentStep === "provider") {
		content = <ProviderOnboardingStep selection={providerSelection} onSelectionChange={setProviderSelection} />;
	} else if (currentStep === "godot_executable") {
		content = <GodotExecutableOnboardingStep settings={generalSettings} onSettingsChange={setGeneralSettings} />;
	} else if (currentStep === "documentation") {
		content = (
			<DocumentationOnboardingStep
				godotVersion={generalSettings.godotExecutableVersion}
				onConfiguredChange={setDocumentationConfigured}
				onBusyChange={setDocumentationBusy}
			/>
		);
	} else if (currentStep === "godot_plugin") {
		content = <GodotPluginOnboardingStep onConfiguredChange={setPluginConfigured} onBusyChange={setPluginBusy} />;
	} else {
		content = (
			<Result
				status="success"
				title={t("onboarding.complete.title")}
				subTitle={t("onboarding.complete.description")}
				extra={(
					<div className={styles.summaryRegion}>
						<div className={styles.summaryList}>
							{CONFIGURABLE_STEPS.map((stepId: OnboardingConfigurableStepId): React.JSX.Element => {
								const outcome: OnboardingStepOutcome = getSummaryOutcome(stepId);
								return (
									<div key={stepId} className={styles.summaryItem}>
										<Typography.Text>{t(`onboarding.steps.${stepId}`)}</Typography.Text>
										<Tag color={outcome === "configured" ? "success" : "default"}>{t(`onboarding.outcomes.${outcome}`)}</Tag>
									</div>
								);
							})}
						</div>
					</div>
				)}
			/>
		);
	}

	const currentConfigurableStep: OnboardingConfigurableStepId | null = CONFIGURABLE_STEPS.includes(currentStep as OnboardingConfigurableStepId)
		? currentStep as OnboardingConfigurableStepId
		: null;
	const canContinue: boolean = currentConfigurableStep === null || configuredByStep[currentConfigurableStep];

	return (
		<main className={styles.root} aria-label={t("onboarding.ariaLabel")}>
			<div className={styles.shell}>
				<Steps current={currentIndex} items={stepItems} responsive={true} size="small" />
				<div className={styles.body}>{content}</div>
				{navigationError !== null ? <Alert showIcon type="error" description={navigationError} /> : null}
				<footer className={styles.footer}>
					<div>
						{currentIndex > 0 && currentStep !== "complete" ? (
							<Button disabled={savingNavigation || activeOperation} onClick={(): void => { void goBack(); }}>
								{t("onboarding.actions.back")}
							</Button>
						) : null}
					</div>
					<Space>
						{currentConfigurableStep !== null ? (
							<Button disabled={savingNavigation || activeOperation} onClick={(): void => { void goForward("skipped"); }}>
								{t("onboarding.actions.skip")}
							</Button>
						) : null}
						{currentStep === "complete" ? (
							<Button type="primary" loading={savingNavigation} onClick={(): void => { void finish(); }}>
								{t("onboarding.actions.enterStudio")}
							</Button>
						) : (
							<Button
								type="primary"
								loading={savingNavigation}
								disabled={!canContinue || activeOperation}
								onClick={(): void => { void goForward(currentConfigurableStep === null ? undefined : "configured"); }}
							>
								{currentStep === "welcome" ? t("onboarding.actions.start") : t("onboarding.actions.next")}
							</Button>
						)}
					</Space>
				</footer>
			</div>
		</main>
	);
}

export default OnboardingWizard;
