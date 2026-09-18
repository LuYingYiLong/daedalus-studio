import { Input, InputNumber, Select, Tag, Typography } from "antd";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Icon } from "@/assets/icons";
import type {
	FlowDocumentNode,
	FlowDocumentNodeRun,
	FlowDocumentNodeStatus,
	FlowNodePortDefinition,
	FlowNodeTypeDefinition,
} from "@/platform/rpc/types";
import type {
	ProviderModelInfo,
	ProviderModelSelection,
} from "@/platform/rpc/provider-api";
import MarkdownContent from "@/widgets/markdown/MarkdownContent";
import styles from "./FlowNodes.module.css";

export type FlowNodeEditorOptions = {
	modelSelection: ProviderModelSelection | null;
	modelsByProvider: Readonly<Record<string, ProviderModelInfo[]>>;
};

export type FlowCanvasNodeData = {
	flowNode: FlowDocumentNode;
	nodeRun: FlowDocumentNodeRun | null;
	definition: FlowNodeTypeDefinition | null;
	editorOptions: FlowNodeEditorOptions;
	matched: boolean;
	locked: boolean;
	onUpdate: (nodeId: string, patch: Record<string, unknown>) => void;
	onAction: (nodeId: string, action: string) => void;
};

export type FlowCanvasNode = Node<FlowCanvasNodeData, "flowNode">;

function statusLabel(status: FlowDocumentNodeStatus): string {
	return status.charAt(0).toUpperCase() + status.slice(1);
}

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

function headerColor(typeId: string): string {
	let hash = 0;
	for (const char of typeId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
	return `hsl(${Math.abs(hash) % 360} 68% 38%)`;
}

export function resolveFlowDefinitionPorts(
	definition: FlowNodeTypeDefinition,
	config: Record<string, unknown>,
): FlowNodePortDefinition[] {
	const ports = definition.ports.map((port): FlowNodePortDefinition => ({ ...port, dataTypes: [...port.dataTypes] }));
	for (const dynamic of definition.dynamicPorts ?? []) {
		const values = config[dynamic.configField];
		if (!Array.isArray(values)) continue;
		for (const value of values.slice(0, 64 - ports.length)) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
			const record = value as Record<string, unknown>;
			const id = record[dynamic.idField];
			if (
				typeof id !== "string" ||
				id.length === 0 ||
				ports.some((port): boolean => port.id === id && port.direction === dynamic.direction)
			)
				continue;
			const configuredType = dynamic.dataTypeField === undefined ? undefined : record[dynamic.dataTypeField];
			const dataTypes: FlowNodePortDefinition["dataTypes"] =
				typeof configuredType === "string" &&
				(configuredType === "text" || configuredType === "json" || configuredType === "artifact")
					? [configuredType]
					: [...dynamic.dataTypes];
			const label = record[dynamic.labelField];
			ports.push({
				id,
				label: typeof label === "string" && label.length > 0 ? label : id,
				direction: dynamic.direction,
				dataTypes,
				required: dynamic.required,
				multiple: dynamic.multiple,
				defaultConnect: dynamic.defaultConnect,
			});
		}
	}
	return ports;
}

export function resolveFlowCanvasPorts(
	node: FlowDocumentNode,
	definition: FlowNodeTypeDefinition | null,
): FlowNodePortDefinition[] {
	if (definition === null || (definition.dynamicPorts?.length ?? 0) === 0)
		return node.ports.length > 0 ? node.ports : (definition?.ports ?? []);
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
	value,
	disabled,
	onChange,
}: {
	name: string;
	value: unknown;
	disabled: boolean;
	onChange: (value: unknown) => void;
}): React.JSX.Element {
	const [text, setText] = useState((): string => JSON.stringify(value ?? {}, null, 2));
	const [invalid, setInvalid] = useState(false);
	useEffect((): void => setText(JSON.stringify(value ?? {}, null, 2)), [value]);
	return (
		<Input.TextArea
			className="nodrag"
			status={invalid ? "error" : undefined}
			disabled={disabled}
			value={text}
			autoSize={{ minRows: 2, maxRows: 7 }}
			placeholder={name}
			onChange={(event): void => setText(event.target.value)}
			onBlur={(): void => {
				try {
					onChange(JSON.parse(text) as unknown);
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
	editorOptions,
	disabled,
	onChange,
}: {
	node: FlowDocumentNode;
	definition: FlowNodeTypeDefinition;
	editorOptions: FlowNodeEditorOptions;
	disabled: boolean;
	onChange: (config: Record<string, unknown>) => void;
}): React.JSX.Element {
	const { t } = useTranslation();
	const [config, setConfig] = useState<Record<string, unknown>>(node.config);
	const configRef = useRef<Record<string, unknown>>(node.config);
	const commitTimerRef = useRef<number | null>(null);
	useEffect((): void => {
		configRef.current = node.config;
		setConfig(node.config);
	}, [node.config]);
	useEffect((): (() => void) => (): void => {
		if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
	}, []);
	const commitConfig = (next: Record<string, unknown>): void => {
		if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
		commitTimerRef.current = null;
		onChange(next);
	};
	const update = (key: string, value: unknown, commit = true): void => {
		const next = { ...configRef.current, [key]: value };
		configRef.current = next;
		setConfig(next);
		if (commit) commitConfig(next);
		else {
			if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
			commitTimerRef.current = window.setTimeout((): void => commitConfig(configRef.current), 250);
		}
	};
	const providerId = typeof config.provider === "string" ? config.provider : "";
	const modelId = typeof config.model === "string" ? config.model : "";
	const providerOptions = (editorOptions.modelSelection?.providers ?? [])
		.filter((provider): boolean => provider.configured || provider.provider === providerId)
		.map((provider) => ({ value: provider.provider, label: provider.displayName }));
	const modelCatalog = editorOptions.modelsByProvider[providerId] ?? [];
	const modelOptions = modelCatalog.map((model) => ({ value: model.id, label: model.displayName }));
	if (modelId.length > 0 && !modelOptions.some((option): boolean => option.value === modelId))
		modelOptions.unshift({ value: modelId, label: modelId });
	const selectedModel = modelCatalog.find((model): boolean => model.id === modelId);
	const configuredEfforts = selectedModel?.customization?.reasoningEfforts ?? selectedModel?.capabilities.reasoningEfforts ?? [];
	const currentEffort = typeof config.reasoningEffort === "string" ? config.reasoningEffort : "";
	const effortOptions = [
		{ value: "", label: t("flow.editor.modelDefault", { defaultValue: "Default" }) },
		...configuredEfforts.map((effort) => ({ value: effort.id, label: effort.id })),
	];
	if (currentEffort.length > 0 && !effortOptions.some((option): boolean => option.value === currentEffort))
		effortOptions.push({ value: currentEffort, label: currentEffort });
	return (
		<div className={styles.compactFields}>
			{Object.entries(readSchemaProperties(definition.configSchema)).map(([key, schema]): React.JSX.Element => {
				const title = typeof schema.title === "string" ? schema.title : key.replaceAll("_", " ");
				const control = schema["x-daedalus-control"];
				if (control === "provider")
					return (
						<Select
							key={key}
							className="nodrag"
							disabled={disabled}
							value={providerId || undefined}
							placeholder={title}
							options={providerOptions}
							showSearch
							optionFilterProp="label"
							onChange={(value): void => {
								const nextProvider = editorOptions.modelSelection?.providers.find(
									(candidate): boolean => candidate.provider === value,
								);
								const nextModel = nextProvider?.selectedModel ?? nextProvider?.defaultModel ?? "";
								const nextModelInfo = editorOptions.modelsByProvider[value]?.find(
									(candidate): boolean => candidate.id === nextModel,
								);
								const nextEffort = (
									nextModelInfo?.customization?.reasoningEfforts ??
									nextModelInfo?.capabilities.reasoningEfforts ??
									[]
								).find((effort): boolean => effort.default === true)?.id ?? "";
								const next = { ...configRef.current, provider: value, model: nextModel, reasoningEffort: nextEffort };
								configRef.current = next;
								setConfig(next);
								commitConfig(next);
							}}
						/>
					);
				if (control === "model")
					return (
						<Select
							key={key}
							className="nodrag"
							disabled={disabled || providerId.length === 0}
							value={modelId || undefined}
							placeholder={title}
							options={modelOptions}
							showSearch
							optionFilterProp="label"
							onChange={(value): void => update(key, value)}
						/>
					);
				if (control === "reasoning-effort")
					return (
						<Select
							key={key}
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
							key={key}
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
						<Select
							key={key}
							className="nodrag"
							disabled={disabled}
							value={typeof config[key] === "boolean" ? config[key] : undefined}
							placeholder={title}
							options={[
								{ value: true, label: `${title}: true` },
								{ value: false, label: `${title}: false` },
							]}
							onChange={(value): void => update(key, value)}
						/>
					);
				if (schema.type === "number" || schema.type === "integer")
					return (
						<InputNumber
							key={key}
							className="nodrag"
							disabled={disabled}
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
							key={key}
							name={title}
							value={config[key]}
							disabled={disabled}
							onChange={(value): void => update(key, value)}
						/>
					);
				const multiline =
					key.toLocaleLowerCase().includes("text") ||
					key.toLocaleLowerCase().includes("prompt") ||
					key.toLocaleLowerCase().includes("template");
				if (multiline)
					return (
						<Input.TextArea
							key={key}
							className="nodrag"
							disabled={disabled}
							value={typeof config[key] === "string" ? config[key] : ""}
							placeholder={title}
							autoSize={{ minRows: 2, maxRows: 8 }}
							onChange={(event): void => update(key, event.target.value, false)}
							onBlur={(): void => commitConfig(configRef.current)}
						/>
					);
				return (
					<Input
						key={key}
						className="nodrag"
						disabled={disabled}
						value={typeof config[key] === "string" ? config[key] : ""}
						placeholder={title}
						onChange={(event): void => update(key, event.target.value, false)}
						onBlur={(): void => commitConfig(configRef.current)}
					/>
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
	const values = (definition?.summaryFields ?? []).flatMap((field): string[] => {
		const value = node.config[field];
		return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
			? [String(value)]
			: [];
	});
	return (
		<Typography.Paragraph className={styles.nodeSummary} ellipsis={{ rows: 3 }}>
			{values.join(" · ") ||
				(definition === null ? `Missing node type: ${node.typeId}` : definition.defaultTitle)}
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
	editorOptions,
	disabled,
	onChange,
	onAction,
}: {
	node: FlowDocumentNode;
	definition: FlowNodeTypeDefinition & { ui: { kind: "sandbox"; entry: string; actions: string[] } };
	editorOptions: FlowNodeEditorOptions;
	disabled: boolean;
	onChange: (config: Record<string, unknown>) => void;
	onAction: (action: string) => void;
}): React.JSX.Element {
	const { i18n } = useTranslation();
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	const [height, setHeight] = useState(220);
	const [failed, setFailed] = useState(false);
	const host = useMemo((): string => pluginUiHost(definition.pluginId), [definition.pluginId]);
	const source = useMemo(
		(): string => `plugin-ui://${host}/${definition.ui.entry.replace(/^\.\//u, "")}`,
		[definition.ui.entry, host],
	);
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
	if (failed)
		return (
			<SchemaEditor
				node={node}
				definition={definition}
				editorOptions={editorOptions}
				disabled={disabled}
				onChange={onChange}
			/>
		);
	return (
		<iframe
			ref={iframeRef}
			className={`${styles.pluginEditor} nodrag nowheel`}
			style={{ height }}
			src={source}
			sandbox="allow-scripts"
			title={definition.defaultTitle}
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
					},
					"*",
				);
			}}
		/>
	);
}

function PortRail({ ports, type }: { ports: FlowNodePortDefinition[]; type: "source" | "target" }): React.JSX.Element {
	return (
		<div className={`${styles.portRail} ${type === "target" ? styles.portRailLeft : styles.portRailRight}`}>
			{ports.map(
				(port): React.JSX.Element => (
					<div
						className={styles.portItem}
						key={port.id}
						title={`${port.label} · ${port.dataTypes.join("/")}`}
					>
						<Handle
							id={port.id}
							type={type}
							position={type === "target" ? Position.Left : Position.Right}
							className={styles.nodeHandle}
							data-flow-port-id={port.id}
						/>
						<span>{port.label}</span>
					</div>
				),
			)}
		</div>
	);
}

function FlowNodeCard({ data }: NodeProps<FlowCanvasNode>): React.JSX.Element {
	const { t } = useTranslation();
	const { flowNode, definition } = data;
	const ports = useMemo(
		(): FlowNodePortDefinition[] => resolveFlowCanvasPorts(flowNode, definition),
		[definition, flowNode],
	);
	const inputPorts = useMemo(
		(): FlowNodePortDefinition[] => ports.filter((port): boolean => port.direction === "input"),
		[ports],
	);
	const outputPorts = useMemo(
		(): FlowNodePortDefinition[] => ports.filter((port): boolean => port.direction === "output"),
		[ports],
	);
	const portAreaHeight = Math.max(inputPorts.length, outputPorts.length) * 32;
	const isOutputNode = flowNode.typeId === "builtin/output";
	const outputMarkdown =
		data.nodeRun?.output === null || data.nodeRun?.output === undefined
			? ""
			: formatOutputMarkdown(data.nodeRun.output, flowNode.config.format);
	const updateConfig = (config: Record<string, unknown>): void => data.onUpdate(flowNode.nodeId, { config });
	return (
		<div className={styles.nodeShell} data-flow-node-id={flowNode.nodeId}>
			<PortRail ports={inputPorts} type="target" />
			<article
				className={`${styles.nodeCard} ${data.matched ? styles.nodeCardMatched : ""} ${definition === null ? styles.unknownNode : ""}`}
				data-node-type={flowNode.typeId}
			>
				<header className={styles.header} style={{ background: headerColor(flowNode.typeId) }}>
					<span className={styles.role}>{flowNode.title}</span>
					<Tag title={data.nodeRun?.error ?? undefined}>
						{statusLabel(data.nodeRun?.status ?? flowNode.status)}
					</Tag>
				</header>
				<div className={styles.body}>
					{portAreaHeight > 0 ? (
						<div className={styles.portSpacer} style={{ height: portAreaHeight }} aria-hidden />
					) : null}
					{definition === null ? (
						<NodeSummary node={flowNode} definition={definition} />
					) : definition.ui.kind === "sandbox" ? (
						<SandboxEditor
							node={flowNode}
							definition={
								definition as FlowNodeTypeDefinition & {
									ui: { kind: "sandbox"; entry: string; actions: string[] };
								}
							}
							editorOptions={data.editorOptions}
							disabled={data.locked}
							onChange={updateConfig}
							onAction={(action): void => data.onAction(flowNode.nodeId, action)}
						/>
					) : (
						<SchemaEditor
							node={flowNode}
							definition={definition}
							editorOptions={data.editorOptions}
							disabled={data.locked}
							onChange={updateConfig}
						/>
					)}
					{isOutputNode ? (
						<div
							className={`${styles.outputResult} nodrag nowheel`}
							role="region"
							aria-label={t("flow.editor.outputResult", { defaultValue: "Output result" })}
						>
							{outputMarkdown.length > 0 ? (
								<MarkdownContent>{outputMarkdown}</MarkdownContent>
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
			</article>
			<PortRail ports={outputPorts} type="source" />
		</div>
	);
}

export const FlowDocumentNodeView = memo(FlowNodeCard);
FlowDocumentNodeView.displayName = "FlowDocumentNodeView";
