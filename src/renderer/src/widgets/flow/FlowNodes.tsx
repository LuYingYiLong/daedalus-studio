import { Button, Input, InputNumber, Select, Tag, Typography } from "antd";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { FlowDocumentNode, FlowDocumentNodeRun, FlowDocumentNodeStatus, FlowDocumentNodeType, FlowNodePortDefinition, FlowNodeTypeDefinition, FlowToolDefinition } from "@/platform/rpc/types";
import styles from "./FlowNodes.module.css";

export type FlowNodeData = {
	flowNode: FlowDocumentNode;
	nodeRun: FlowDocumentNodeRun | null;
	definition: FlowNodeTypeDefinition | null;
	tools: FlowToolDefinition[];
	matched: boolean;
	locked: boolean;
	onUpdate: (nodeId: string, patch: Record<string, unknown>) => void;
};

export type FlowCanvasNode = Node<FlowNodeData, "flowNode">;

const roleLabels: Record<FlowDocumentNodeType, string> = {
	prompt: "Prompt",
	text: "Text",
	template: "Template",
	merge: "Merge",
	json_extract: "JSON Extract",
	condition: "Condition",
	file_input: "File Input",
	llm: "LLM",
	tool: "Tool",
	command: "Command",
	output: "Output",
	note: "Note",
};
const roleIcons: Record<FlowDocumentNodeType, string> = {
	prompt: "user",
	text: "pencil",
	template: "pencil",
	merge: "branches",
	json_extract: "code",
	condition: "branches",
	file_input: "file",
	llm: "agent",
	tool: "tool",
	command: "terminal",
	output: "check",
	note: "pencil",
};

function statusLabel(status: FlowDocumentNodeStatus): string {
	return status === "cached" ? "Cached" : status[0].toUpperCase() + status.slice(1);
}
function readString(config: Record<string, unknown>, key: string): string {
	return typeof config[key] === "string" ? config[key] : "";
}
function readNumber(config: Record<string, unknown>, key: string, fallback: number): number {
	return typeof config[key] === "number" ? config[key] : fallback;
}

export function resolveFlowCanvasPorts(node: FlowDocumentNode, definition: FlowNodeTypeDefinition | null): FlowNodePortDefinition[] {
	if ((node.type !== "template" && node.type !== "merge") || !Array.isArray(node.config.inputs)) return definition?.ports ?? [];
	const inputs = node.config.inputs.flatMap((candidate, index): FlowNodePortDefinition[] => {
		if (candidate === null || typeof candidate !== "object") return [];
		const value = candidate as Record<string, unknown>;
		if (typeof value.id !== "string" || typeof value.label !== "string") return [];
		const dataType = value.dataType === "json" || value.dataType === "artifact" ? value.dataType : "text";
		return [
			{
				id: value.id,
				label: value.label,
				direction: "input",
				dataTypes: [dataType],
				required: true,
				multiple: false,
				defaultConnect: index === 0,
			},
		];
	});
	return [...inputs, ...(definition?.ports.filter((port): boolean => port.direction === "output") ?? [])];
}

function DynamicInputs({ config, disabled, onChange }: { config: Record<string, unknown>; disabled: boolean; onChange: (patch: Record<string, unknown>) => void }): React.JSX.Element {
	const inputs = Array.isArray(config.inputs) ? config.inputs.filter((input): input is Record<string, unknown> => input !== null && typeof input === "object") : [];
	return (
		<div className={styles.dynamicInputs}>
			{inputs.map(
				(input, index): React.JSX.Element => (
					<div key={String(input.id)} className={styles.dynamicInputRow}>
						<Input
							size="small"
							className="nodrag"
							disabled={disabled}
							value={String(input.label ?? "")}
							onChange={(event): void =>
								onChange({
									inputs: inputs.map((item, itemIndex): Record<string, unknown> => (itemIndex === index ? { ...item, label: event.target.value } : item)),
								})
							}
						/>
						<Button
							size="small"
							type="text"
							disabled={disabled || inputs.length <= 1}
							icon={<Icon name="remove" />}
							onClick={(): void =>
								onChange({
									inputs: inputs.filter((_item, itemIndex): boolean => itemIndex !== index),
								})
							}
						/>
					</div>
				),
			)}
			<Button
				size="small"
				type="dashed"
				disabled={disabled}
				icon={<Icon name="add" />}
				onClick={(): void => {
					const id = `input-${Date.now().toString(36)}`;
					onChange({
						inputs: [...inputs, { id, label: `Input ${inputs.length + 1}`, dataType: "text" }],
					});
				}}
			>
				Add input
			</Button>
		</div>
	);
}

function ToolConfigEditor({ config, tools, disabled, onChange }: { config: Record<string, unknown>; tools: FlowToolDefinition[]; disabled: boolean; onChange: (patch: Record<string, unknown>) => void }): React.JSX.Element {
	const toolName = readString(config, "toolName");
	const tool = tools.find((candidate): boolean => candidate.name === toolName);
	const args = config.args !== null && typeof config.args === "object" && !Array.isArray(config.args) ? (config.args as Record<string, unknown>) : {};
	const bindings = Array.isArray(config.bindings) ? config.bindings.filter((binding): binding is Record<string, unknown> => binding !== null && typeof binding === "object") : [];
	const properties = tool?.inputSchema.properties !== null && typeof tool?.inputSchema.properties === "object" ? (tool.inputSchema.properties as Record<string, Record<string, unknown>>) : {};
	const updateArg = (key: string, value: unknown): void => onChange({ args: { ...args, [key]: value } });
	return (
		<div className={styles.compactFields}>
			<Select
				className="nodrag"
				showSearch
				optionFilterProp="label"
				disabled={disabled}
				value={toolName || undefined}
				placeholder="Select workspace tool"
				options={tools.map((candidate): { value: string; label: string } => ({
					value: candidate.name,
					label: candidate.name,
				}))}
				onChange={(nextToolName): void => onChange({ toolName: nextToolName, args: {}, bindings: [] })}
			/>
			{tool !== undefined ? (
				<Typography.Text type="secondary" className={styles.toolDescription}>
					{tool.description} · {tool.risk}
				</Typography.Text>
			) : null}
			{Object.entries(properties).map(([key, schema]): React.JSX.Element => {
				const type = typeof schema.type === "string" ? schema.type : "string";
				if (type === "boolean")
					return (
						<Select
							key={key}
							className="nodrag"
							disabled={disabled}
							placeholder={key}
							value={typeof args[key] === "boolean" ? args[key] : undefined}
							options={[
								{ value: true, label: `${key}: true` },
								{ value: false, label: `${key}: false` },
							]}
							onChange={(value): void => updateArg(key, value)}
						/>
					);
				if (type === "number" || type === "integer") return <InputNumber key={key} className="nodrag" disabled={disabled} placeholder={key} value={typeof args[key] === "number" ? args[key] : undefined} onChange={(value): void => updateArg(key, value)} />;
				return <Input key={key} className="nodrag" disabled={disabled} placeholder={key} value={typeof args[key] === "string" ? args[key] : ""} onChange={(event): void => updateArg(key, event.target.value)} />;
			})}
			<div className={styles.bindingList}>
				{bindings.map(
					(binding, index): React.JSX.Element => (
						<div key={`${String(binding.argumentPath)}:${index}`} className={styles.bindingRow}>
							<Input
								size="small"
								className="nodrag"
								disabled={disabled}
								placeholder="Argument path"
								value={String(binding.argumentPath ?? "")}
								onChange={(event): void =>
									onChange({
										bindings: bindings.map((item, itemIndex): Record<string, unknown> => (itemIndex === index ? { ...item, argumentPath: event.target.value } : item)),
									})
								}
							/>
							<Input
								size="small"
								className="nodrag"
								disabled={disabled}
								placeholder="Value path"
								value={String(binding.valuePath ?? "")}
								onChange={(event): void =>
									onChange({
										bindings: bindings.map((item, itemIndex): Record<string, unknown> => (itemIndex === index ? { ...item, valuePath: event.target.value } : item)),
									})
								}
							/>
							<Button
								size="small"
								type="text"
								disabled={disabled}
								icon={<Icon name="remove" />}
								onClick={(): void =>
									onChange({
										bindings: bindings.filter((_item, itemIndex): boolean => itemIndex !== index),
									})
								}
							/>
						</div>
					),
				)}
			</div>
			<Button
				size="small"
				type="dashed"
				disabled={disabled}
				onClick={(): void =>
					onChange({
						bindings: [...bindings, { argumentPath: "/argument", inputPort: "input", valuePath: "" }],
					})
				}
			>
				Bind input to argument
			</Button>
		</div>
	);
}

function ConfigEditor({ node, tools, disabled, onChange }: { node: FlowDocumentNode; tools: FlowToolDefinition[]; disabled: boolean; onChange: (config: Record<string, unknown>) => void }): React.JSX.Element {
	const [config, setConfig] = useState<Record<string, unknown>>(node.config);
	useEffect((): void => setConfig(node.config), [node.config]);
	const commit = (patch: Record<string, unknown>): void => {
		const next = { ...config, ...patch };
		setConfig(next);
		onChange(next);
	};
	const textArea = (key: string, placeholder: string): React.JSX.Element => (
		<Input.TextArea
			className="nodrag"
			value={readString(config, key)}
			autoSize={{ minRows: 3, maxRows: 8 }}
			placeholder={placeholder}
			disabled={disabled}
			onChange={(event): void =>
				setConfig(
					(current): Record<string, unknown> => ({
						...current,
						[key]: event.target.value,
					}),
				)
			}
			onBlur={(): void => onChange(config)}
		/>
	);
	if (node.type === "prompt" || node.type === "text" || node.type === "note") return textArea("text", node.type === "note" ? "Write a note…" : "Enter text…");
	if (node.type === "template")
		return (
			<>
				{textArea("template", "Use {{input}} variables…")}
				<DynamicInputs config={config} disabled={disabled} onChange={commit} />
			</>
		);
	if (node.type === "merge")
		return (
			<>
				<Select
					className="nodrag"
					disabled={disabled}
					value={readString(config, "mode") || "concat"}
					options={[
						{ value: "concat", label: "Concatenate text" },
						{ value: "array", label: "JSON array" },
						{ value: "object", label: "JSON object" },
					]}
					onChange={(mode): void => commit({ mode })}
				/>
				{readString(config, "mode") === "concat" ? (
					<Input
						className="nodrag"
						disabled={disabled}
						value={readString(config, "separator")}
						placeholder="Separator"
						onChange={(event): void =>
							setConfig(
								(current): Record<string, unknown> => ({
									...current,
									separator: event.target.value,
								}),
							)
						}
						onBlur={(): void => onChange(config)}
					/>
				) : null}
				<DynamicInputs config={config} disabled={disabled} onChange={commit} />
			</>
		);
	if (node.type === "json_extract")
		return (
			<Input
				className="nodrag"
				disabled={disabled}
				value={readString(config, "pointer")}
				placeholder="JSON Pointer, e.g. /items/0"
				onChange={(event): void =>
					setConfig(
						(current): Record<string, unknown> => ({
							...current,
							pointer: event.target.value,
						}),
					)
				}
				onBlur={(): void => onChange(config)}
			/>
		);
	if (node.type === "condition")
		return (
			<div className={styles.compactFields}>
				<Input
					className="nodrag"
					disabled={disabled}
					value={readString(config, "pointer")}
					placeholder="JSON Pointer"
					onChange={(event): void =>
						setConfig(
							(current): Record<string, unknown> => ({
								...current,
								pointer: event.target.value,
							}),
						)
					}
					onBlur={(): void => onChange(config)}
				/>
				<Select
					className="nodrag"
					disabled={disabled}
					value={readString(config, "operator") || "equals"}
					options={["equals", "not_equals", "contains", "matches", "gt", "gte", "lt", "lte", "exists"].map((value): { value: string; label: string } => ({
						value,
						label: value.replaceAll("_", " "),
					}))}
					onChange={(operator): void => commit({ operator })}
				/>
				{readString(config, "operator") !== "exists" ? (
					<Input
						className="nodrag"
						disabled={disabled}
						value={String(config.value ?? "")}
						placeholder="Comparison value"
						onChange={(event): void =>
							setConfig(
								(current): Record<string, unknown> => ({
									...current,
									value: event.target.value,
								}),
							)
						}
						onBlur={(): void => onChange(config)}
					/>
				) : null}
			</div>
		);
	if (node.type === "file_input")
		return (
			<div className={styles.compactFields}>
				<Input
					className="nodrag"
					disabled={disabled}
					value={readString(config, "path")}
					placeholder="Relative workspace path"
					onChange={(event): void =>
						setConfig(
							(current): Record<string, unknown> => ({
								...current,
								path: event.target.value,
							}),
						)
					}
					onBlur={(): void => onChange(config)}
				/>
				<Select
					className="nodrag"
					disabled={disabled}
					value={readString(config, "mode") || "text"}
					options={[
						{ value: "text", label: "Text" },
						{ value: "json", label: "JSON" },
						{ value: "artifact", label: "Artifact" },
					]}
					onChange={(mode): void => commit({ mode })}
				/>
			</div>
		);
	if (node.type === "llm")
		return (
			<div className={styles.compactFields}>
				<Input
					className="nodrag"
					disabled={disabled}
					value={readString(config, "provider")}
					placeholder="Provider"
					onChange={(event): void =>
						setConfig(
							(current): Record<string, unknown> => ({
								...current,
								provider: event.target.value,
							}),
						)
					}
					onBlur={(): void => onChange(config)}
				/>
				<Input
					className="nodrag"
					disabled={disabled}
					value={readString(config, "model")}
					placeholder="Model"
					onChange={(event): void =>
						setConfig(
							(current): Record<string, unknown> => ({
								...current,
								model: event.target.value,
							}),
						)
					}
					onBlur={(): void => onChange(config)}
				/>
				{textArea("systemPrompt", "Optional system prompt")}
			</div>
		);
	if (node.type === "tool") return <ToolConfigEditor config={config} tools={tools} disabled={disabled} onChange={commit} />;
	if (node.type === "command")
		return (
			<div className={styles.compactFields}>
				<Input
					className="nodrag"
					disabled={disabled}
					value={readString(config, "commandLine")}
					placeholder="Command line"
					onChange={(event): void =>
						setConfig(
							(current): Record<string, unknown> => ({
								...current,
								commandLine: event.target.value,
							}),
						)
					}
					onBlur={(): void => onChange(config)}
				/>
				<Input
					className="nodrag"
					disabled={disabled}
					value={readString(config, "cwd")}
					placeholder="Working directory (optional)"
					onChange={(event): void =>
						setConfig(
							(current): Record<string, unknown> => ({
								...current,
								cwd: event.target.value,
							}),
						)
					}
					onBlur={(): void => onChange(config)}
				/>
				<InputNumber className="nodrag" disabled={disabled} min={1_000} max={600_000} value={readNumber(config, "timeoutMs", 30_000)} addonAfter="ms" onChange={(timeoutMs): void => commit({ timeoutMs: timeoutMs ?? 30_000 })} />
			</div>
		);
	if (node.type === "output")
		return (
			<Select
				className="nodrag"
				disabled={disabled}
				value={readString(config, "format") || "text"}
				options={[
					{ value: "text", label: "Text" },
					{ value: "json", label: "JSON" },
				]}
				onChange={(format): void => commit({ format })}
			/>
		);
	return <></>;
}

function PortRail({ ports, type }: { ports: FlowNodePortDefinition[]; type: "source" | "target" }): React.JSX.Element {
	return (
		<div className={`${styles.portRail} ${type === "target" ? styles.portRailLeft : styles.portRailRight}`}>
			{ports.map(
				(port): React.JSX.Element => (
					<div className={styles.portItem} key={port.id} title={`${port.label} · ${port.dataTypes.join("/")}`}>
						<Handle id={port.id} type={type} position={type === "target" ? Position.Left : Position.Right} className={styles.nodeHandle} data-flow-port-id={port.id} aria-label={`${port.label} ${type === "source" ? "output" : "input"}`} />
						<span>{port.label}</span>
					</div>
				),
			)}
		</div>
	);
}

function FlowNodeCard({ data }: NodeProps<FlowCanvasNode>): React.JSX.Element {
	const { t } = useTranslation();
	const { flowNode } = data;
	const ports = useMemo((): FlowNodePortDefinition[] => resolveFlowCanvasPorts(flowNode, data.definition), [data.definition, flowNode]);
	const inputs = ports.filter((port): boolean => port.direction === "input");
	const outputs = ports.filter((port): boolean => port.direction === "output");
	const update = (patch: Record<string, unknown>): void => data.onUpdate(flowNode.nodeId, patch);
	return (
		<div className={styles.nodeShell} data-flow-node-id={flowNode.nodeId}>
			<PortRail ports={inputs} type="target" />
			<article className={`${styles.nodeCard} ${data.matched ? styles.nodeCardMatched : ""}`} data-node-type={flowNode.type}>
				<header className={`${styles.header} ${styles[`header-${flowNode.type}`]}`}>
					<span className={styles.role}>
						<Icon name={roleIcons[flowNode.type]} />
						{t(`flow.editor.nodes.${flowNode.type}`, {
							defaultValue: roleLabels[flowNode.type],
						})}
					</span>
					<Tag>{statusLabel(flowNode.status)}</Tag>
				</header>
				<div className={styles.body}>
					<ConfigEditor node={flowNode} tools={data.tools} disabled={data.locked} onChange={(config): void => update({ config })} />
					{data.nodeRun?.output !== null && data.nodeRun?.output !== undefined ? (
						<Typography.Paragraph className={styles.resultPreview} ellipsis={{ rows: 4, expandable: true }}>
							{JSON.stringify(data.nodeRun.output)}
						</Typography.Paragraph>
					) : null}
				</div>
				<footer className={styles.footer}>
					<Typography.Text type={data.nodeRun?.status === "failed" ? "danger" : "secondary"} className={styles.statusText}>
						{data.nodeRun?.error ?? data.nodeRun?.status ?? flowNode.status}
					</Typography.Text>
				</footer>
			</article>
			<PortRail ports={outputs} type="source" />
		</div>
	);
}

export const FlowDocumentNodeView = memo(FlowNodeCard);
FlowDocumentNodeView.displayName = "FlowDocumentNodeView";
