import { Alert, Button, Tabs, Tree, Typography } from "antd";
import type { DataNode } from "antd/es/tree";
import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type {
  ComputerObservation,
  ComputerRect,
} from "../../../../contracts/computer-observation";
import styles from "./ComputerObservationEvidence.module.css";

export function ComputerObservationEvidence({
  observation,
}: {
  observation: ComputerObservation;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [box, setBox] = useState<ComputerRect | null>(null);
  const roots: DataNode[] = [];
  const nodes = new Map<string, DataNode>();
  for (const node of observation.nodes) {
    const entry: DataNode = {
      key: node.id,
      title: `${node.controlType} ${node.password ? "••••" : node.name}`,
      children: [],
    };
    nodes.set(node.id, entry);
    if (node.parentId && nodes.has(node.parentId))
      nodes.get(node.parentId)!.children!.push(entry);
    else roots.push(entry);
  }
  return (
    <>
      <Typography.Paragraph type="secondary">
        {t("computer.coordinates", {
          x: observation.screenBounds.x,
          y: observation.screenBounds.y,
          width: observation.screenBounds.width,
          height: observation.screenBounds.height,
        })}
        <br />
        UIA: {observation.uiaCapturedAt}
      </Typography.Paragraph>
      <Typography.Text>
        {observation.width} × {observation.height} ·{" "}
        {Math.round(observation.durationMs)} ms · {observation.dpi} DPI ·{" "}
        {observation.capturedAt}
      </Typography.Text>
      {observation.truncated && (
        <Alert type="warning" title={t("computer.truncated")} />
      )}
      {observation.dataUrl && (
        <div className={styles.frame} style={{ "--frame-ratio": observation.width / observation.height } as CSSProperties}>
          <img alt={t("computer.frame")} src={observation.dataUrl} />
          {box && (
            <div
              className={styles.highlight}
              style={{
                left: `${(box.x / observation.width) * 100}%`,
                top: `${(box.y / observation.height) * 100}%`,
                width: `${(box.width / observation.width) * 100}%`,
                height: `${(box.height / observation.height) * 100}%`,
              }}
            />
          )}
        </div>
      )}
      <Tabs
        items={[
          {
            key: "uia",
            label: "UI Automation",
            children: (
              <div className={styles.evidence}>
                <Tree
                  treeData={roots}
                  onSelect={(keys) =>
                    setBox(
                      observation.nodes.find((node) => node.id === keys[0])
                        ?.bounds ?? null,
                    )
                  }
                />
              </div>
            ),
          },
          {
            key: "ocr",
            label: "OCR",
            children: (
              <div className={styles.evidence}>
                {observation.texts.map((block) => (
                  <div key={block.id}>
                    <Button
                      type="text"
                      className={styles.text}
                      onClick={() => setBox(block.bounds)}
                    >
                      {block.text} ({Math.round(block.confidence * 100)}%)
                    </Button>
                  </div>
                ))}
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
