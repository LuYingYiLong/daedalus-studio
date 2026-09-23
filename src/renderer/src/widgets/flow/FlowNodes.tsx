import { FlowMediaGallery } from "./FlowMediaGallery";
import { FlowParameterSetsEditor } from "./FlowParameterSetsEditor";
import { FlowListEditor } from "./FlowListEditor";
import {
	Popconfirm,
	BorderBeam,
	ColorPicker,
	Switch,
	Button,
	Input,
	InputNumber,
	Select,
	Space,
	Tooltip,
	Typography,
} from "antd";
import {
	memo,
	useContext,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { Handle, Position, useUpdateNodeInternals, type Node } from "@xyflow/react";
import { FlowRenderContext } from "./flow-render-runtime";
import { FlowCanvasStore } from "@/domain/flow/flow-render-stores";
import type {
	FlowDocumentNode,
	FlowDocumentNodeRun,
	FlowMediaArtifactRef,
	FlowNodeOutputDefinition,
	FlowNodeParameterDefinition,
	FlowNodePortDefinition,
	FlowNodeTypeDefinition,
} from "@/platform/rpc/types";
import type { ProviderModelInfo, ProviderModelSelection } from "@/platform/rpc/provider-api";
import { Icon } from "@/assets/icons";
import MarkdownContent from "@/widgets/markdown/MarkdownContent";
import styles from "./FlowNodes.module.css";
import { flowNodeOutputLabel, flowNodeParameterLabel, flowNodeTitle, flowNodeTypeLabel } from "./flow-node-labels";
import { flowDefaultControl, flowPortColor, flowPortColorKind, FLOW_PORT_COLORS } from "./flow-port-colors";
import { flowNodeCategoryColor } from "./flow-node-category-colors";

export type FlowNodeEditorOptions = {
	modelSelection: ProviderModelSelection | null;
	modelsByProvider: Readonly<Record<string, ProviderModelInfo[]>>;
	selectWorkspaceFile?: (() => Promise<string | null>) | undefined;
};

export type FlowCanvasNodeData = {
	flowNode: FlowDocumentNode;
	nodeRun: FlowDocumentNodeRun | null;
	definition: FlowNodeTypeDefinition | null;
	editorOptions: FlowNodeEditorOptions;
	connectedInputIds: ReadonlySet<string>;
	matched: boolean;
	locked: boolean;
	runDisabled: boolean;
	onUpdate: (nodeId: string, patch: Record<string, unknown>) => void;
	onAction: (nodeId: string, action: string) => void;
};

export type FlowCanvasNode = Node<FlowCanvasNodeData, "flowNode">;

function unwrapNodeOutput(output: unknown): unknown {
	if (output !== null && typeof output === "object" && !Array.isArray(output)) {
		const values = Object.values(output as Record<string, unknown>);
		if (values.length === 1) return values[0];
	}
	return output;
}

function formatOutputMarkdown(output: unknown, format: unknown): string {
	const value = unwrapNodeOutput(output);
	if (value === null || value === undefined) return "";
	if (format === "json" || typeof value === "object") {
		let jsonValue: unknown = value;
		if (typeof value === "string") {
			try {
				jsonValue = JSON.parse(value) as unknown;
			} catch {
				return `\`\`\`json\n${value}\n\`\`\``;
			}
		}
		return `\`\`\`json\n${JSON.stringify(jsonValue, null, 2)}\n\`\`\``;
	}
	return String(value);
}

function collectMediaArtifacts(value: unknown, result: FlowMediaArtifactRef[] = []): FlowMediaArtifactRef[] {
	if (Array.isArray(value)) {
		for (const item of value) collectMediaArtifacts(item, result);
		return result;
	}
	if (value === null || typeof value !== "object") return result;
	const record = value as Record<string, unknown>;
	if (typeof record.artifactId === "string" && typeof record.mimeType === "string") {
		result.push(record as unknown as FlowMediaArtifactRef);
		return result;
	}
	for (const item of Object.values(record)) collectMediaArtifacts(item, result);
	return result;
}

export function applyFlowProviderSelection(
	config: Record<string, unknown>,
	provider: string,
	model: string,
	reasoningEffort: string,
	supportsReasoningEffort: boolean,
): Record<string, unknown> {
	const next: Record<string, unknown> = { ...config, provider, model };
	if (supportsReasoningEffort) next.reasoningEffort = reasoningEffort;
	else delete next.reasoningEffort;
	return next;
}

export function resolveFlowDefinitionParameters(
	definition: FlowNodeTypeDefinition,
	config: Record<string, unknown>,
): FlowNodeParameterDefinition[] {
	const parameters = definition.parameters.map(
		(parameter): FlowNodeParameterDefinition => structuredClone(parameter),
	);
	for (const dynamic of definition.dynamicParameters ?? []) {
		const values = config[dynamic.configField];
		if (!Array.isArray(values)) continue;
		for (const value of values.slice(0, 64 - parameters.length)) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
			const record = value as Record<string, unknown>;
			const id = record[dynamic.idField];
			if (
				typeof id !== "string" ||
				id.length === 0 ||
				parameters.some((parameter): boolean => parameter.id === id)
			)
				continue;
			const configuredType = dynamic.dataTypeField === undefined ? undefined : record[dynamic.dataTypeField];
			const dataTypes: FlowNodePortDefinition["dataTypes"] =
				typeof configuredType === "string" &&
				Object.prototype.hasOwnProperty.call(FLOW_PORT_COLORS, configuredType)
					? [configuredType as FlowNodePortDefinition["dataTypes"][number]]
					: [...dynamic.dataTypes];
			const label = record[dynamic.labelField];
			parameters.push({
				id,
				label: typeof label === "string" && label.length > 0 ? label : id,
				mode: "connection",
				dataTypes,
				required: dynamic.required,
				multiple: dynamic.multiple,
				defaultConnect: dynamic.defaultConnect,
			});
		}
	}
	if (
		typeof config.elementType === "string" &&
		Object.prototype.hasOwnProperty.call(FLOW_PORT_COLORS, config.elementType)
	)
		for (const parameter of parameters)
			if (parameter.mode !== "fixed" && parameter.id !== "index")
				parameter.dataTypes = [config.elementType as FlowNodePortDefinition["dataTypes"][number]];
	return parameters;
}

export function resolveFlowDefinitionPorts(
	definition: FlowNodeTypeDefinition,
	config: Record<string, unknown>,
): FlowNodePortDefinition[] {
	const ports = resolveFlowDefinitionParameters(definition, config).flatMap((parameter): FlowNodePortDefinition[] =>
		parameter.mode === "fixed"
			? []
			: [
					{
						id: parameter.id,
						label: parameter.label,
						direction: "input",
						dataTypes: [...parameter.dataTypes],
						required: parameter.required,
						multiple: parameter.multiple,
						defaultConnect: parameter.defaultConnect,
						cardinality: parameter.cardinality,
					},
				],
	);
	for (const output of definition.outputs)
		ports.push({
			id: output.id,
			label: output.label,
			direction: "output",
			dataTypes: [...output.dataTypes],
			required: false,
			multiple: true,
			defaultConnect: output.defaultConnect,
			cardinality: output.cardinality,
		});
	if (definition.typeId === "builtin/flow-input")
		for (const port of ports)
			if (port.direction === "output") port.dataTypes = [config.dataType === "json" ? "json" : "text"];
	if (
		typeof config.elementType === "string" &&
		Object.prototype.hasOwnProperty.call(FLOW_PORT_COLORS, config.elementType)
	)
		for (const port of ports)
			if (port.id !== "index")
				port.dataTypes = [config.elementType as FlowNodePortDefinition["dataTypes"][number]];
	return ports;
}

export function resolveFlowCanvasPorts(
	node: FlowDocumentNode,
	definition: FlowNodeTypeDefinition | null,
): FlowNodePortDefinition[] {
	if (definition === null) return node.ports;
	return resolveFlowDefinitionPorts(definition, node.config);
}

function readSchemaProperties(schema: Record<string, unknown>): Record<string, Record<string, unknown>> {
	const properties = schema.properties;
	return properties !== null && typeof properties === "object" && !Array.isArray(properties)
		? (properties as Record<string, Record<string, unknown>>)
		: {};
}

function JsonField({
	name,
	fieldId,
	value,
	disabled,
	onChange,
}: {
	name: string;
	fieldId: string;
	value: unknown;
	disabled: boolean;
	onChange: (value: unknown) => void;
}): React.JSX.Element {
	const runtime = useContext(FlowRenderContext);
	const [text, setText] = useState(
		(): string => runtime?.canvas.rawFields.get(fieldId) ?? JSON.stringify(value ?? {}, null, 2),
	);
	const [invalid, setInvalid] = useState(false);
	useEffect((): void => {
		if (!runtime?.canvas.rawFields.has(fieldId)) setText(JSON.stringify(value ?? {}, null, 2));
	}, [value, runtime, fieldId]);
	return (
		<Input.TextArea
			className="nodrag"
			status={invalid ? "error" : undefined}
			disabled={disabled}
			value={text}
			autoSize={{ minRows: 2, maxRows: 7 }}
			placeholder={name}
			onChange={(event): void => {
				setText(event.target.value);
				runtime?.canvas.rawFields.set(fieldId, event.target.value);
			}}
			onBlur={(): void => {
				try {
					onChange(JSON.parse(text) as unknown);
					runtime?.canvas.rawFields.delete(fieldId);
					setInvalid(false);
				} catch {
					setInvalid(true);
				}
			}}
		/>
	);
}

function SchemaEditor({
	node,
	definition,
	parameters,
	connectedInputIds,
	editorOptions,
	disabled,
	onChange,
}: {
	node: FlowDocumentNode;
	definition: FlowNodeTypeDefinition;
	parameters: FlowNodeParameterDefinition[];
	connectedInputIds: ReadonlySet<string>;
	editorOptions: FlowNodeEditorOptions;
	disabled: boolean;
	onChange: (config: Record<string, unknown>) => void;
}): React.JSX.Element {
	const { t } = useTranslation();
	const runtime = useContext(FlowRenderContext);
	const [fallbackStore] = useState(() => new FlowCanvasStore());
	const canvas = runtime?.canvas ?? fallbackStore;
	const config = useSyncExternalStore(
		useCallback((listener) => canvas.drafts.subscribe(node.nodeId, listener), [canvas, node.nodeId]),
		() => canvas.drafts.get(node.nodeId) ?? node.config,
	);
	const configRef = useRef(config);
	configRef.current = config;
	const setConfig = (next: Record<string, unknown>): void => canvas.drafts.set(node.nodeId, next);
	useEffect((): void => {
		canvas.acceptConfig(node.nodeId, node.config);
	}, [canvas, node.nodeId, node.config]);
	useEffect(() => () => fallbackStore.dispose(), [fallbackStore]);
	const commitConfig = (next: Record<string, unknown>): void => {
		if (next !== node.config) canvas.updateDraft(node.nodeId, next, onChange, true);
	};
	const update = (key: string, value: unknown, commit = true): void => {
		const next = { ...configRef.current, [key]: value };
		configRef.current = next;
		setConfig(next);
		canvas.updateDraft(node.nodeId, next, onChange, commit);
	};
	const providerId = typeof config.provider === "string" ? config.provider : "";
	const modelId = typeof config.model === "string" ? config.model : "";
	const requiredCapability = definition.modelCapability ?? null;
	const supportsRequiredCapability = (model: ProviderModelInfo): boolean =>
		requiredCapability === null || model.capabilities[requiredCapability] === true;
	const providerOptions = (editorOptions.modelSelection?.providers ?? [])
		.filter(
			(provider): boolean =>
				(provider.configured || provider.provider === providerId) &&
				(requiredCapability === null ||
					(editorOptions.modelsByProvider[provider.provider] ?? []).some(supportsRequiredCapability)),
		)
		.map((provider) => ({ value: provider.provider, label: provider.displayName }));
	const modelCatalog = editorOptions.modelsByProvider[providerId] ?? [];
	const modelOptions = modelCatalog
		.filter(supportsRequiredCapability)
		.map((model) => ({ value: model.id, label: model.displayName }));
	if (modelId.length > 0 && !modelOptions.some((option): boolean => option.value === modelId))
		modelOptions.unshift({ value: modelId, label: modelId });
	const selectedModel = modelCatalog.find((model): boolean => model.id === modelId);
	const configuredEfforts =
		selectedModel?.customization?.reasoningEfforts ?? selectedModel?.capabilities.reasoningEfforts ?? [];
	const currentEffort = typeof config.reasoningEffort === "string" ? config.reasoningEffort : "";
	const effortOptions = [
		{ value: "", label: t("flow.editor.modelDefault", { defaultValue: "Default" }) },
		...configuredEfforts.map((effort) => ({ value: effort.id, label: effort.id })),
	];
	if (currentEffort.length > 0 && !effortOptions.some((option): boolean => option.value === currentEffort))
		effortOptions.push({ value: currentEffort, label: currentEffort });
	const properties = readSchemaProperties(definition.configSchema);
	const onSelectOpenChange = (open: boolean): void => {
		if (open) {
			canvas.popups.add(node.nodeId);
			canvas.pin(node.nodeId, true);
		} else {
			canvas.popups.delete(node.nodeId);
			canvas.pin(node.nodeId, false);
		}
	};
	const supportsReasoningEffort = Object.prototype.hasOwnProperty.call(properties, "reasoningEffort");
	const renderControl = (key: string, schema: Record<string, unknown>, title: string): React.JSX.Element => {
		const parameter = definition.parameters.find(
			(parameter) => parameter.mode !== "connection" && parameter.configField === key,
		);
		const control =
			schema["x-daedalus-control"] ??
			(parameter?.mode === "hybrid" ? flowDefaultControl(parameter.dataTypes) : undefined);
		if (control === "parameter-sets")
			return (
				<FlowParameterSetsEditor
					disabled={disabled}
					value={config[key]}
					onChange={(value) => update(key, value, false)}
				/>
			);
		if (control === "typed-list") {
			const fieldId = `${node.nodeId}\u0000${key}`;
			const items = Array.isArray(config[key]) ? config[key] : [];
			return (
				<FlowListEditor
					type={String(config.elementType ?? "json")}
					value={items}
					disabled={disabled}
					itemKeys={canvas.getListItemKeys(fieldId, items.length)}
					onRemove={(index) => canvas.removeListItem(fieldId, index)}
					onChange={(value) => update(key, value, false)}
					onOpenChange={onSelectOpenChange}
					renderJson={(itemKey, value, onChange) => (
						<JsonField
							fieldId={`${fieldId}\u0000${itemKey}`}
							name={title}
							value={value}
							disabled={disabled}
							onChange={onChange}
						/>
					)}
				/>
			);
		}
		if (control === "color") {
			const color = (config[key] ?? { r: 1, g: 1, b: 1, a: 1 }) as { r: number; g: number; b: number; a: number };
			return (
				<ColorPicker
					disabled={disabled}
					value={`rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, ${color.a})`}
					onOpenChange={onSelectOpenChange}
					onChangeComplete={(value) => {
						const rgb = value.toRgb();
						update(key, { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255, a: rgb.a });
					}}
					showText
				/>
			);
		}
		if (control === "size") {
			const value = (config[key] ?? { width: 1024, height: 1024 }) as { width: number; height: number };
			return (
				<Space.Compact>
					<InputNumber
						disabled={disabled}
						min={1}
						max={16000}
						value={value.width}
						onChange={(width) => {
							if (width !== null) update(key, { ...value, width });
						}}
					/>
					<InputNumber
						disabled={disabled}
						min={1}
						max={16000}
						value={value.height}
						onChange={(height) => {
							if (height !== null) update(key, { ...value, height });
						}}
					/>
				</Space.Compact>
			);
		}
		const isWorkspaceFileControl =
			control === "workspace-file" ||
			schema.format === "workspace-file" ||
			(definition.typeId === "builtin/file-input" && key === "path");
		if (isWorkspaceFileControl)
			return (
				<Space.Compact block className="nodrag">
					<Input
						className="nodrag"
						disabled={disabled}
						value={typeof config[key] === "string" ? config[key] : ""}
						placeholder={title}
						onChange={(event): void => update(key, event.target.value, false)}
						onBlur={(): void => commitConfig(configRef.current)}
					/>
					<Tooltip title={t("flow.editor.chooseFile", { defaultValue: "Choose file" })}>
						<Button
							className="nodrag"
							aria-label={t("flow.editor.chooseFile", { defaultValue: "Choose file" })}
							disabled={disabled || editorOptions.selectWorkspaceFile === undefined}
							icon={<Icon name="folder-open" />}
							onClick={(): void => {
								if (editorOptions.selectWorkspaceFile === undefined) return;
								const generation = canvas.generation;
								void editorOptions
									.selectWorkspaceFile()
									.then((path): void => {
										if (path !== null && canvas.generation === generation) update(key, path);
									})
									.catch((): void => undefined);
							}}
						/>
					</Tooltip>
				</Space.Compact>
			);
		if (control === "provider")
			return (
				<Select
					onOpenChange={onSelectOpenChange}
					className="nodrag"
					disabled={disabled}
					value={providerId || undefined}
					placeholder={title}
					options={providerOptions}
					showSearch
					onChange={(value): void => {
						const nextProvider = editorOptions.modelSelection?.providers.find(
							(candidate): boolean => candidate.provider === value,
						);
						const compatibleModels = (editorOptions.modelsByProvider[value] ?? []).filter(
							supportsRequiredCapability,
						);
						const preferredModel = nextProvider?.selectedModel ?? nextProvider?.defaultModel;
						const nextModel =
							compatibleModels.find((candidate) => candidate.id === preferredModel)?.id ??
							compatibleModels[0]?.id ??
							"";
						const nextModelInfo = editorOptions.modelsByProvider[value]?.find(
							(candidate): boolean => candidate.id === nextModel,
						);
						const nextEffort =
							(
								nextModelInfo?.customization?.reasoningEfforts ??
								nextModelInfo?.capabilities.reasoningEfforts ??
								[]
							).find((effort): boolean => effort.default === true)?.id ?? "";
						const next = applyFlowProviderSelection(
							configRef.current,
							value,
							nextModel,
							nextEffort,
							supportsReasoningEffort,
						);
						configRef.current = next;
						setConfig(next);
						commitConfig(next);
					}}
				/>
			);
		if (control === "model")
			return (
				<Select
					onOpenChange={onSelectOpenChange}
					className="nodrag"
					disabled={disabled || providerId.length === 0}
					value={modelId || undefined}
					placeholder={title}
					options={modelOptions}
					showSearch
					onChange={(value): void => update(key, value)}
				/>
			);
		if (control === "reasoning-effort")
			return (
				<Select
					onOpenChange={onSelectOpenChange}
					className="nodrag"
					disabled={disabled || modelId.length === 0}
					value={currentEffort}
					placeholder={title}
					options={effortOptions}
					onChange={(value): void => update(key, value)}
				/>
			);
		const enumValues = Array.isArray(schema.enum)
			? schema.enum.filter(
					(value): value is string | number => typeof value === "string" || typeof value === "number",
				)
			: [];
		if (enumValues.length > 0)
			return (
				<Select
					onOpenChange={onSelectOpenChange}
					className="nodrag"
					disabled={disabled}
					value={config[key] as string | number | undefined}
					placeholder={title}
					options={enumValues.map((value) => ({ value, label: String(value) }))}
					onChange={(value): void => update(key, value)}
				/>
			);
		if (schema.type === "boolean")
			return (
				<Switch
					disabled={disabled}
					checked={config[key] === true}
					onChange={(value) => update(key, value, false)}
				/>
			);
		if (schema.type === "number" || schema.type === "integer")
			return (
				<InputNumber
					className="nodrag"
					disabled={disabled}
					suffix={typeof schema["x-daedalus-unit"] === "string" ? schema["x-daedalus-unit"] : undefined}
					value={typeof config[key] === "number" ? config[key] : undefined}
					placeholder={title}
					min={typeof schema.minimum === "number" ? schema.minimum : undefined}
					max={typeof schema.maximum === "number" ? schema.maximum : undefined}
					onChange={(value): void => update(key, value)}
				/>
			);
		if (schema.type === "object" || schema.type === "array")
			return (
				<JsonField
					fieldId={`${node.nodeId}\u0000${key}`}
					name={title}
					value={config[key]}
					disabled={disabled}
					onChange={(value): void => update(key, value)}
				/>
			);
		const multiline =
			key.toLocaleLowerCase().includes("text") ||
			key.toLocaleLowerCase().includes("prompt") ||
			key.toLocaleLowerCase().includes("template") ||
			key === "stdin";
		if (multiline)
			return (
				<Input.TextArea
					className="nodrag"
					disabled={disabled}
					value={typeof config[key] === "string" ? config[key] : ""}
					placeholder={title}
					autoSize={{ minRows: 1, maxRows: 8 }}
					onChange={(event): void => update(key, event.target.value, false)}
					onBlur={(): void => commitConfig(configRef.current)}
				/>
			);
		return (
			<Input
				className="nodrag"
				disabled={disabled}
				value={typeof config[key] === "string" ? config[key] : ""}
				placeholder={title}
				onChange={(event): void => update(key, event.target.value, false)}
				onBlur={(): void => commitConfig(configRef.current)}
			/>
		);
	};
	return (
		<div className={styles.parameterList}>
			{parameters.map((parameter): React.JSX.Element => {
				const parameterLabel = flowNodeParameterLabel(t, definition.typeId, parameter.id, parameter.label);
				const connectable = parameter.mode !== "fixed";
				const connected = connectable && connectedInputIds.has(parameter.id);
				const configField = parameter.mode === "connection" ? null : parameter.configField;
				const schema = configField === null ? undefined : properties[configField];
				const hidesControl =
					parameter.mode === "connection" ||
					(parameter.mode === "hybrid" && connected && parameter.hideControlWhenConnected);
				const expandedControl =
					schema?.["x-daedalus-control"] === "parameter-sets" ||
					schema?.["x-daedalus-control"] === "typed-list";
				return (
					<div
						key={parameter.id}
						className={`${styles.parameterRow} ${hidesControl ? styles.parameterRowConnectionOnly : ""}`}
						data-parameter-mode={parameter.mode}
						data-parameter-connected={connected ? "true" : "false"}
						style={expandedControl ? { flexWrap: "wrap" } : undefined}
					>
						<span className={styles.parameterSocket}>
							{connectable ? (
								<Handle
									id={parameter.id}
									type="target"
									position={Position.Left}
									className={styles.parameterHandle}
									data-flow-port-id={parameter.id}
									data-flow-port-kind={flowPortColorKind(parameter.dataTypes)}
									style={{ "--flow-port-color": flowPortColor(parameter.dataTypes) } as CSSProperties}
								/>
							) : null}
						</span>
						<span className={styles.parameterLabel} title={parameterLabel}>
							{parameterLabel}
							{connectable && parameter.cardinality && parameter.cardinality !== "one" ? " []" : ""}
						</span>
						{!hidesControl && configField !== null && schema !== undefined ? (
							<div
								className={styles.parameterControl}
								style={expandedControl ? { flex: "1 1 100%", maxWidth: "100%" } : undefined}
							>
								{renderControl(configField, schema, parameterLabel)}
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}

function NodeSummary({
	node,
	definition,
}: {
	node: FlowDocumentNode;
	definition: FlowNodeTypeDefinition | null;
}): React.JSX.Element {
	const { t } = useTranslation();
	const values = (definition?.summaryFields ?? []).flatMap((field): string[] => {
		const value = node.config[field];
		return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
			? [String(value)]
			: [];
	});
	return (
		<Typography.Paragraph className={styles.nodeSummary} ellipsis={{ rows: 3 }}>
			{values.join(" · ") ||
				(definition === null ? `Missing node type: ${node.typeId}` : flowNodeTypeLabel(t, definition))}
		</Typography.Paragraph>
	);
}

function schemaAccepts(schema: Record<string, unknown>, value: unknown, depth: number = 0): boolean {
	if (depth > 12) return false;
	if (Array.isArray(schema.enum) && !schema.enum.some((candidate): boolean => Object.is(candidate, value)))
		return false;
	const type = schema.type;
	if (type === "string")
		return typeof value === "string" && (typeof schema.maxLength !== "number" || value.length <= schema.maxLength);
	if (type === "number") return typeof value === "number" && Number.isFinite(value);
	if (type === "integer") return typeof value === "number" && Number.isInteger(value);
	if (type === "boolean") return typeof value === "boolean";
	if (type === "array")
		return (
			Array.isArray(value) &&
			(typeof schema.maxItems !== "number" || value.length <= schema.maxItems) &&
			(!schema.items ||
				typeof schema.items !== "object" ||
				value.every((item): boolean => schemaAccepts(schema.items as Record<string, unknown>, item, depth + 1)))
		);
	if (type === "object") {
		if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
		const properties = readSchemaProperties(schema);
		const additional = schema.additionalProperties;
		return Object.entries(value).every(([key, child]): boolean => {
			const property = properties[key];
			if (property !== undefined) return schemaAccepts(property, child, depth + 1);
			if (additional === false) return false;
			return (
				typeof additional !== "object" ||
				additional === null ||
				schemaAccepts(additional as Record<string, unknown>, child, depth + 1)
			);
		});
	}
	return true;
}

function pluginUiHost(pluginId: string): string {
	const encoded = [...new TextEncoder().encode(pluginId)]
		.map((value): string => value.toString(16).padStart(2, "0"))
		.join("");
	return encoded.match(/.{1,60}/gu)?.join(".") ?? encoded;
}

function SandboxEditor({
	node,
	definition,
	parameters,
	connectedInputIds,
	editorOptions,
	disabled,
	onChange,
	onAction,
}: {
	node: FlowDocumentNode;
	definition: FlowNodeTypeDefinition & { ui: { kind: "sandbox"; entry: string; actions: string[] } };
	parameters: FlowNodeParameterDefinition[];
	connectedInputIds: ReadonlySet<string>;
	editorOptions: FlowNodeEditorOptions;
	disabled: boolean;
	onChange: (config: Record<string, unknown>) => void;
	onAction: (action: string) => void;
}): React.JSX.Element {
	const { i18n, t } = useTranslation();
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	const [height, setHeight] = useState(220);
	const [failed, setFailed] = useState(false);
	const host = useMemo((): string => pluginUiHost(definition.pluginId), [definition.pluginId]);
	const source = useMemo(
		(): string => `plugin-ui://${host}/${definition.ui.entry.replace(/^\.\//u, "")}`,
		[definition.ui.entry, host],
	);
	const connectedInputKey = [...connectedInputIds].sort().join("\u0000");
	useEffect((): (() => void) => {
		const receive = (event: MessageEvent): void => {
			// An iframe without allow-same-origin intentionally has an opaque origin.
			// Bind messages to the exact child window and reject non-sandbox origins.
			if (event.source !== iframeRef.current?.contentWindow || event.origin !== "null") return;
			let size = 0;
			try {
				size = new TextEncoder().encode(JSON.stringify(event.data)).byteLength;
			} catch {
				return;
			}
			if (size > 64 * 1024 || typeof event.data !== "object" || event.data === null) return;
			const message = event.data as Record<string, unknown>;
			if (
				message.type === "daedalus.flow.resize" &&
				typeof message.height === "number" &&
				Number.isFinite(message.height)
			) {
				setHeight(Math.max(120, Math.min(640, Math.round(message.height))));
				return;
			}
			if (
				message.type === "daedalus.flow.patch" &&
				!disabled &&
				typeof message.patch === "object" &&
				message.patch !== null &&
				!Array.isArray(message.patch)
			) {
				const patch = message.patch as Record<string, unknown>;
				const properties = readSchemaProperties(definition.configSchema);
				if (
					Object.entries(patch).every(
						([key, value]): boolean =>
							properties[key] !== undefined && schemaAccepts(properties[key]!, value),
					)
				)
					onChange({ ...node.config, ...patch });
				return;
			}
			if (
				message.type === "daedalus.flow.action" &&
				!disabled &&
				typeof message.action === "string" &&
				definition.ui.actions.includes(message.action)
			)
				onAction(message.action);
		};
		window.addEventListener("message", receive);
		return (): void => window.removeEventListener("message", receive);
	}, [definition.configSchema, definition.ui.actions, disabled, host, node.config, onAction, onChange]);
	useEffect((): void => {
		iframeRef.current?.contentWindow?.postMessage(
			{
				type: "daedalus.flow.update",
				readOnly: disabled,
				config: node.config,
				connectedInputIds: [...connectedInputIds],
			},
			"*",
		);
	}, [connectedInputIds, connectedInputKey, disabled, node.config]);
	if (failed)
		return (
			<SchemaEditor
				node={node}
				definition={definition}
				parameters={parameters}
				connectedInputIds={connectedInputIds}
				editorOptions={editorOptions}
				disabled={disabled}
				onChange={onChange}
			/>
		);
	return (
		<>
			<div className={styles.parameterList}>
				{parameters
					.filter(
						(parameter): parameter is Exclude<FlowNodeParameterDefinition, { mode: "fixed" }> =>
							parameter.mode !== "fixed",
					)
					.map(
						(parameter): React.JSX.Element => (
							<div
								className={`${styles.parameterRow} ${styles.parameterRowConnectionOnly}`}
								key={parameter.id}
							>
								<span className={styles.parameterSocket}>
									<Handle
										id={parameter.id}
										type="target"
										position={Position.Left}
										className={styles.parameterHandle}
										data-flow-port-id={parameter.id}
										data-flow-port-kind={flowPortColorKind(parameter.dataTypes)}
										style={
											{ "--flow-port-color": flowPortColor(parameter.dataTypes) } as CSSProperties
										}
									/>
								</span>
								<span
									className={styles.parameterLabel}
									title={flowNodeParameterLabel(t, definition.typeId, parameter.id, parameter.label)}
								>
									{flowNodeParameterLabel(t, definition.typeId, parameter.id, parameter.label)}
								</span>
							</div>
						),
					)}
			</div>
			<iframe
				ref={iframeRef}
				className={`${styles.pluginEditor} nodrag nowheel`}
				style={{ height }}
				src={source}
				sandbox="allow-scripts"
				title={flowNodeTypeLabel(t, definition)}
				onError={(): void => setFailed(true)}
				onLoad={(): void => {
					iframeRef.current?.contentWindow?.postMessage(
						{
							type: "daedalus.flow.init",
							version: 1,
							theme: document.documentElement.dataset.theme ?? "system",
							language: i18n.resolvedLanguage ?? i18n.language,
							readOnly: disabled,
							config: node.config,
							connectedInputIds: [...connectedInputIds],
						},
						"*",
					);
				}}
			/>
		</>
	);
}

function OutputRows({
	typeId,
	outputs,
}: {
	typeId: string;
	outputs: FlowNodeOutputDefinition[];
}): React.JSX.Element | null {
	const { t } = useTranslation();
	if (outputs.length === 0) return null;
	return (
		<div className={styles.outputList}>
			{outputs.map((output): React.JSX.Element => {
				const outputLabel = flowNodeOutputLabel(t, typeId, output.id, output.label);
				return (
					<div
						className={styles.outputRow}
						key={output.id}
						title={`${outputLabel} · ${output.dataTypes.join("/")}`}
					>
						<span className={styles.outputLabel}>
							{outputLabel}
							{output.cardinality === "many" ? " []" : ""}
						</span>
						<span className={styles.outputSocket}>
							<Handle
								id={output.id}
								type="source"
								position={Position.Right}
								className={styles.parameterHandle}
								data-flow-port-id={output.id}
								data-flow-port-kind={flowPortColorKind(output.dataTypes)}
								style={{ "--flow-port-color": flowPortColor(output.dataTypes) } as CSSProperties}
							/>
						</span>
					</div>
				);
			})}
		</div>
	);
}

function CollapsedPorts({
	ids,
	direction,
}: {
	ids: string[];
	direction: "input" | "output";
}): React.JSX.Element | null {
	const { t } = useTranslation();
	if (ids.length === 0) return null;
	return (
		<span
			className={`${styles.collapsedPorts} ${direction === "input" ? styles.collapsedPortsLeft : styles.collapsedPortsRight}`}
			data-flow-collapsed-ports={direction}
			title={t("flow.editor.expandPorts")}
		>
			{ids.map((id) => (
				<Handle
					key={id}
					id={id}
					type={direction === "input" ? "target" : "source"}
					position={direction === "input" ? Position.Left : Position.Right}
					className={styles.collapsedPortAnchor}
					isConnectable={false}
				/>
			))}
		</span>
	);
}

function FlowNodeCard({
	data,
	selected,
	collapsed,
	onToggleCollapsed,
}: {
	data: FlowCanvasNodeData;
	selected: boolean;
	collapsed: boolean;
	onToggleCollapsed: () => void;
}): React.JSX.Element {
	const { t } = useTranslation();
	const nodeElement = useRef<HTMLDivElement>(null);
	const commits = useRef(0);
	useLayoutEffect(() => {
		commits.current++;
		if (nodeElement.current) nodeElement.current.dataset.flowCommitCount = String(commits.current);
		if ((window as unknown as { __DAEDALUS_FLOW_TRACE__?: boolean }).__DAEDALUS_FLOW_TRACE__) {
			performance.mark("daedalus.flow.node.commit", { detail: { nodeId: data.flowNode.nodeId } });
		}
	});
	const runtime = useContext(FlowRenderContext);
	const [pluginEditing, setPluginEditing] = useState(false);
	useEffect(() => {
		if (collapsed) setPluginEditing(false);
	}, [collapsed]);
	const { flowNode, definition } = data;
	const updateNodeInternals = useUpdateNodeInternals();
	const parameters = useMemo(
		(): FlowNodeParameterDefinition[] =>
			definition === null
				? flowNode.ports
						.filter((port): boolean => port.direction === "input")
						.map(
							(port): FlowNodeParameterDefinition => ({
								id: port.id,
								label: port.label,
								mode: "connection",
								dataTypes: [...port.dataTypes],
								required: port.required,
								multiple: port.multiple,
								defaultConnect: port.defaultConnect,
							}),
						)
				: resolveFlowDefinitionParameters(definition, flowNode.config),
		[definition, flowNode],
	);
	const outputs = useMemo(
		(): FlowNodeOutputDefinition[] =>
			definition === null
				? flowNode.ports
						.filter((port): boolean => port.direction === "output")
						.map(
							(port): FlowNodeOutputDefinition => ({
								id: port.id,
								label: port.label,
								dataTypes: [...port.dataTypes],
								defaultConnect: port.defaultConnect,
							}),
						)
				: resolveFlowDefinitionPorts(definition, flowNode.config).filter((port) => port.direction === "output"),
		[definition, flowNode.ports],
	);
	const definitionLayoutKey =
		definition === null
			? "unknown"
			: `${definition.pluginFingerprint}:${definition.configVersion}:${definition.ui.kind}`;
	const handleLayoutKey = `${definitionLayoutKey}:${outputs.map((output): string => output.id).join("|")}:${parameters.map((parameter): string => `${parameter.id}:${data.connectedInputIds.has(parameter.id) ? 1 : 0}`).join("|")}`;
	useEffect(
		(): void => updateNodeInternals(flowNode.nodeId),
		[flowNode.nodeId, handleLayoutKey, collapsed, updateNodeInternals],
	);
	const isOutputNode = flowNode.typeId === "builtin/output" || flowNode.typeId === "builtin/media-output";
	const mediaArtifacts = useMemo(
		(): FlowMediaArtifactRef[] => collectMediaArtifacts(data.nodeRun?.output),
		[data.nodeRun?.output],
	);
	const outputMarkdown =
		data.nodeRun?.output === null || data.nodeRun?.output === undefined
			? ""
			: formatOutputMarkdown(data.nodeRun.output, flowNode.config.format);
	const updateConfig = (config: Record<string, unknown>): void =>
		data.onUpdate(flowNode.nodeId, { config, historyGroup: runtime?.canvas.editGroups.get(flowNode.nodeId) });
	const nodeTitle = flowNodeTitle(t, flowNode, definition);
	const nodeStatus = data.nodeRun?.status ?? flowNode.status;
	const nodeError = data.nodeRun?.error?.trim() || t("flow.editor.nodeFailureFallback");
	const runInputLabel =
		typeof flowNode.config.label === "string" && flowNode.config.label.trim().length > 0
			? flowNode.config.label.trim()
			: nodeTitle;
	return (
		<div
			ref={nodeElement}
			className={`${styles.nodeShell} ${collapsed ? styles.nodeShellCollapsed : ""}`}
			data-flow-node-id={flowNode.nodeId}
		>
			<BorderBeam lineWidth={2} size={256} style={{ display: nodeStatus === "running" ? undefined : "none" }}>
				<article
					className={`${styles.nodeCard} ${collapsed ? styles.nodeCardCollapsed : ""} ${selected ? styles.nodeCardSelected : ""} ${data.matched ? styles.nodeCardMatched : ""} ${definition === null ? styles.unknownNode : ""}`}
					data-node-type={flowNode.typeId}
					data-node-status={nodeStatus}
				>
					<header
						className={styles.header}
						style={{ background: flowNodeCategoryColor(definition?.category) }}
						onPointerDown={(event): void => {
							if (
								(event.target as Element).closest(
									"button,input,textarea,select,[contenteditable=true]",
								) !== null
							)
								return;
							const active = document.activeElement;
							if (active instanceof HTMLElement && nodeElement.current?.contains(active)) active.blur();
						}}
					>
						{collapsed ? (
							<>
								<CollapsedPorts
									ids={parameters
										.filter((parameter) => parameter.mode !== "fixed")
										.map((parameter) => parameter.id)}
									direction="input"
								/>
								<CollapsedPorts ids={outputs.map((output) => output.id)} direction="output" />
							</>
						) : null}
						<div className={styles.headerTitle}>
							<button
								type="button"
								className={`${styles.switcher} nodrag nopan`}
								data-flow-switcher
								aria-expanded={!collapsed}
								aria-label={t(collapsed ? "flow.editor.expandNode" : "flow.editor.collapseNode")}
								title={t(collapsed ? "flow.editor.expandNode" : "flow.editor.collapseNode")}
								onPointerDown={(event) => event.stopPropagation()}
								onDoubleClick={(event) => event.stopPropagation()}
								onClick={(event) => {
									event.stopPropagation();
									onToggleCollapsed();
								}}
							>
								<Icon name="arrow-down" />
							</button>
							<span className={styles.role}>{nodeTitle}</span>
						</div>
						<div className={styles.headerActions}>
							{flowNode.typeId === "builtin/flow-input" ? (
								<Tooltip title={t("flow.editor.runEntry", { input: runInputLabel })}>
									<Button
										type="text"
										shape="circle"
										size="small"
										className={`${styles.runInputButton} nodrag nopan`}
										icon={<Icon name="play" />}
										disabled={data.runDisabled}
										aria-label={t("flow.editor.runEntry", { input: runInputLabel })}
										onPointerDown={(event): void => event.stopPropagation()}
										onClick={(event): void => {
											event.stopPropagation();
											data.onAction(flowNode.nodeId, "run-input");
										}}
									/>
								</Tooltip>
							) : null}
							{nodeStatus === "failed" || nodeStatus === "partial_failure" ? (
								<Tooltip
									title={<span className={styles.errorTooltip}>{nodeError}</span>}
									trigger={["hover", "focus"]}
								>
									<span
										className={`${styles.failedIndicator} nodrag nopan`}
										role="img"
										aria-label={t("flow.editor.nodeFailed")}
										tabIndex={0}
										onPointerDown={(event): void => event.stopPropagation()}
									>
										<Icon name="failed" aria-hidden="true" />
									</span>
								</Tooltip>
							) : null}
						</div>
					</header>
					{!collapsed ? (
						<div className={`${styles.body}${isOutputNode ? ` ${styles.outputBody}` : ""}`}>
							{typeof data.nodeRun?.progress === "number" && data.nodeRun.status === "running" ? (
								<div
									className={styles.progressTrack}
									aria-label={`${Math.round(data.nodeRun.progress * 100)}%`}
								>
									<div
										className={styles.progressValue}
										style={{ width: `${Math.round(data.nodeRun.progress * 100)}%` }}
									/>
								</div>
							) : null}
							<OutputRows typeId={flowNode.typeId} outputs={outputs} />
							{definition === null ? (
								<NodeSummary node={flowNode} definition={definition} />
							) : definition.ui.kind === "sandbox" && pluginEditing ? (
								<SandboxEditor
									node={flowNode}
									definition={
										definition as FlowNodeTypeDefinition & {
											ui: { kind: "sandbox"; entry: string; actions: string[] };
										}
									}
									parameters={parameters}
									connectedInputIds={data.connectedInputIds}
									editorOptions={data.editorOptions}
									disabled={data.locked}
									onChange={updateConfig}
									onAction={(action): void => data.onAction(flowNode.nodeId, action)}
								/>
							) : (
								<SchemaEditor
									node={flowNode}
									definition={definition}
									parameters={parameters}
									connectedInputIds={data.connectedInputIds}
									editorOptions={data.editorOptions}
									disabled={data.locked}
									onChange={updateConfig}
								/>
							)}
							{definition?.ui.kind === "sandbox" ? (
								<Button
									size="small"
									className="nodrag nopan"
									onClick={() => {
										const next = !pluginEditing;
										setPluginEditing(next);
										runtime?.canvas.pin(flowNode.nodeId, next);
										if (next) runtime?.canvas.pluginEditors.add(flowNode.nodeId);
										else runtime?.canvas.pluginEditors.delete(flowNode.nodeId);
									}}
								>
									{t(
										pluginEditing
											? "flow.editor.closePluginEditor"
											: "flow.editor.openPluginEditor",
										{
											defaultValue: pluginEditing ? "Finish editing" : "Open plugin editor",
										},
									)}
								</Button>
							) : null}
							{data.nodeRun?.batchItems ? (
								<div className="nodrag nowheel" style={{ maxHeight: 200, overflow: "auto" }}>
									<Typography.Text type="secondary">
										{t("flow.batch.completed", {
											count: Object.values(data.nodeRun.batchItems).filter(
												(item) => item.status === "completed",
											).length,
											total: Object.keys(data.nodeRun.batchItems).length,
										})}
									</Typography.Text>
									{Object.values(data.nodeRun.batchItems)
										.sort((a, b) => Number(a.ordinal) - Number(b.ordinal))
										.map((item) => (
											<div key={String(item.itemId)}>
												<Tooltip title={JSON.stringify(item.params)}>
													<Typography.Text
														type={
															item.status === "failed" || item.status === "uncertain"
																? "danger"
																: "secondary"
														}
													>
														{Number(item.ordinal) + 1}.{" "}
														{t(`flow.batch.status.${item.status}`)}
														{item.error ? ` · ${String(item.error)}` : ""}
													</Typography.Text>
												</Tooltip>
											</div>
										))}
									<Button
										disabled={data.runDisabled}
										size="small"
										onClick={() => data.onAction(flowNode.nodeId, "retry-batch")}
									>
										{t("flow.batch.retry")}
									</Button>
									<Popconfirm
										title={t("flow.batch.regenerateConfirm")}
										onConfirm={() => data.onAction(flowNode.nodeId, "run")}
									>
										<Button disabled={data.runDisabled} size="small" danger>
											{t("flow.batch.regenerate")}
										</Button>
									</Popconfirm>
								</div>
							) : null}
							{isOutputNode ? (
								<div
									className={`${styles.outputResult}${mediaArtifacts.length > 0 ? ` ${styles.outputResultMedia}` : ""} nodrag${mediaArtifacts.length === 0 ? " nowheel" : ""}`}
									role="region"
									aria-label={t("flow.editor.outputResult", { defaultValue: "Output result" })}
								>
									{mediaArtifacts.length > 0 ? (
										<FlowMediaGallery artifacts={mediaArtifacts} />
									) : outputMarkdown.length > 0 ? (
										<MarkdownContent cacheParsing>{outputMarkdown}</MarkdownContent>
									) : (
										<Typography.Text type="secondary">
											{t("flow.editor.outputPending", {
												defaultValue: "Run the Flow to see its output here",
											})}
										</Typography.Text>
									)}
								</div>
							) : null}
						</div>
					) : null}
				</article>
			</BorderBeam>
		</div>
	);
}

export const FlowDocumentNodeView = memo(FlowNodeCard);
FlowDocumentNodeView.displayName = "FlowDocumentNodeView";
