import { Button, Input, Select, Tag, Typography } from "antd";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo, useMemo, useState } from "react";
import { Icon } from "@/assets/icons";
import type {
  FlowDocumentNode,
  FlowDocumentNodeStatus,
  FlowDocumentNodeType,
} from "@/platform/rpc/types";
import styles from "./FlowNodes.module.css";

export type FlowNodeData = {
  flowNode: FlowDocumentNode;
  matched: boolean;
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
};

export type FlowCanvasNode = Node<FlowNodeData, "flowNode">;

const roleLabels: Record<FlowDocumentNodeType, string> = {
  prompt: "Prompt",
  llm: "LLM",
  output: "Output",
  note: "Note",
};

const roleIcons: Record<FlowDocumentNodeType, string> = {
  prompt: "user",
  llm: "agent",
  output: "check",
  note: "pencil",
};

function statusLabel(status: FlowDocumentNodeStatus): string {
  return status === "cached"
    ? "Cached"
    : status[0].toUpperCase() + status.slice(1);
}

function readString(config: Record<string, unknown>, key: string): string {
  return typeof config[key] === "string" ? (config[key] as string) : "";
}

function FlowNodeCard({ data }: NodeProps<FlowCanvasNode>): React.JSX.Element {
  const { flowNode } = data;
  const [draftTitle, setDraftTitle] = useState(flowNode.title);
  const configText = useMemo(
    (): string => readString(flowNode.config, "text"),
    [flowNode.config],
  );
  const [draftText, setDraftText] = useState(configText);
  const [draftProvider, setDraftProvider] = useState((): string =>
    readString(flowNode.config, "provider"),
  );
  const [draftModel, setDraftModel] = useState((): string =>
    readString(flowNode.config, "model"),
  );
  const update = (patch: Record<string, unknown>): void =>
    data.onUpdate(flowNode.nodeId, patch);
  const headerClass = `${styles.header} ${styles[`header-${flowNode.type}`]}`;
  const hasInput = flowNode.type === "llm" || flowNode.type === "output";
  const hasOutput = flowNode.type === "prompt" || flowNode.type === "llm";
  return (
    <div className={styles.nodeShell}>
      {hasInput ? (
        <Handle
          id="input"
          type="target"
          position={Position.Left}
          className={styles.nodeHandle}
        />
      ) : null}
      <article
        className={`${styles.nodeCard} ${data.matched ? styles.nodeCardMatched : ""}`}
        data-node-type={flowNode.type}
      >
        <header className={headerClass}>
          <span className={styles.role}>
            <Icon name={roleIcons[flowNode.type]} />
            {roleLabels[flowNode.type]}
          </span>
          <Tag>{statusLabel(flowNode.status)}</Tag>
        </header>
        <div className={styles.body}>
          <Input
            variant="borderless"
            className={`${styles.titleInput} nodrag`}
            value={draftTitle}
            onChange={(event): void => setDraftTitle(event.target.value)}
            onBlur={(): void => update({ title: draftTitle })}
          />
          {flowNode.type === "prompt" || flowNode.type === "note" ? (
            <Input.TextArea
              className={`${styles.nodeEditor} nodrag`}
              value={draftText}
              autoSize={{ minRows: 3, maxRows: 7 }}
              placeholder={
                flowNode.type === "prompt" ? "Enter a prompt…" : "Write a note…"
              }
              onChange={(event): void => setDraftText(event.target.value)}
              onBlur={(): void =>
                update({ config: { ...flowNode.config, text: draftText } })
              }
            />
          ) : null}
          {flowNode.type === "llm" ? (
            <div className={`${styles.compactFields} nodrag`}>
              <Input
                size="small"
                placeholder="Provider"
                value={draftProvider}
                onChange={(event): void => setDraftProvider(event.target.value)}
                onBlur={(): void =>
                  update({ config: { ...flowNode.config, provider: draftProvider } })
                }
              />
              <Input
                size="small"
                placeholder="Model"
                value={draftModel}
                onChange={(event): void => setDraftModel(event.target.value)}
                onBlur={(): void =>
                  update({ config: { ...flowNode.config, model: draftModel } })
                }
              />
            </div>
          ) : null}
          {flowNode.type === "output" ? (
            <div className={styles.outputPreview}>
              <Typography.Text type="secondary">
                {readString(flowNode.config, "result") ||
                  "Connect an input to preview output"}
              </Typography.Text>
              <Select
                className="nodrag"
                size="small"
                value={readString(flowNode.config, "format") || "text"}
                options={[
                  { value: "text", label: "Text" },
                  { value: "json", label: "JSON" },
                ]}
                onChange={(format): void =>
                  update({ config: { ...flowNode.config, format } })
                }
              />
            </div>
          ) : null}
        </div>
        <footer className={styles.footer}>
          <Typography.Text type="secondary" className={styles.statusText}>
            {flowNode.status}
          </Typography.Text>
          <Button
            type="text"
            size="small"
            icon={<Icon name="remove" />}
            aria-label="Delete node"
            onClick={(): void => data.onDelete(flowNode.nodeId)}
          />
        </footer>
      </article>
      {hasOutput ? (
        <Handle
          id="output"
          type="source"
          position={Position.Right}
          className={styles.nodeHandle}
        />
      ) : null}
    </div>
  );
}

export const FlowDocumentNodeView = memo(FlowNodeCard);
FlowDocumentNodeView.displayName = "FlowDocumentNodeView";
