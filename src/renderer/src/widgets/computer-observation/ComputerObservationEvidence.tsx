import { Alert, Button, Tabs, Tag, Tree, Typography } from "antd";
import type { DataNode } from "antd/es/tree";
import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type {
	ComputerObservation,
	ComputerRect,
} from "../../../../contracts/computer-observation";
import type { ComputerGroundingResult } from "../../../../contracts/computer-grounding";
import styles from "./ComputerObservationEvidence.module.css";

type ComputerObservationEvidenceProps = {
	observation: ComputerObservation;
	groundings?: readonly ComputerGroundingResult[];
};

export function ComputerObservationEvidence(
	props: ComputerObservationEvidenceProps,
): React.JSX.Element {
	return (
		<ComputerObservationEvidenceFrame
			key={props.observation.observationId}
			{...props}
		/>
	);
}

function ComputerObservationEvidenceFrame({
	observation,
	groundings,
}: ComputerObservationEvidenceProps): React.JSX.Element {
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
				<div
					className={styles.frame}
					style={
						{
							"--frame-ratio": observation.width / observation.height,
						} as CSSProperties
					}
				>
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
											{block.text} ({Math.round(block.confidence * 100)}
											%)
										</Button>
									</div>
								))}
							</div>
						),
					},
					...(groundings === undefined
						? []
						: [
								{
									key: "grounding",
									label: t("computer.grounding.tab"),
									children: (
										<div className={styles.evidence}>
											<Typography.Paragraph type="secondary">
												{t("computer.grounding.untrusted")}
											</Typography.Paragraph>
											{groundings.length === 0 && (
												<Typography.Text type="secondary">
													{t("computer.grounding.empty")}
												</Typography.Text>
											)}
											{groundings
												.filter(
													(result) =>
														result.observationId === observation.observationId,
												)
												.map((result) => (
													<section
														key={result.groundingId}
														className={styles.grounding}
													>
														<Typography.Paragraph className={styles.text}>
															<Typography.Text strong>
																{t("computer.grounding.query")}:{" "}
															</Typography.Text>
															{result.target}
														</Typography.Paragraph>
														<dl className={styles.groundingMetadata}>
															<dt>{t("computer.grounding.provider")}</dt>
															<dd>{result.provider}</dd>
															<dt>{t("computer.grounding.model")}</dt>
															<dd>{result.model}</dd>
															<dt>{t("computer.grounding.duration")}</dt>
															<dd>{Math.round(result.durationMs)} ms</dd>
															<dt>{t("computer.grounding.status")}</dt>
															<dd>
																<Tag>
																	{t(
																		`computer.grounding.statuses.${result.status}`,
																	)}
																</Tag>
															</dd>
														</dl>
														{result.candidates.length === 0 ? (
															<Typography.Text type="secondary">
																{t("computer.grounding.noCandidates")}
															</Typography.Text>
														) : (
															<ol
																className={styles.groundingCandidates}
																aria-label={t("computer.grounding.candidates")}
															>
																{result.candidates.map((candidate, index) => (
																	<li key={index}>
																		<Button
																			type="text"
																			htmlType="button"
																			className={styles.groundingCandidate}
																			title={t(
																				"computer.grounding.highlightOnly",
																			)}
																			disabled={!observation.dataUrl}
																			onClick={() => setBox(candidate.box)}
																		>
																			<span>
																				{candidate.description ||
																					t("computer.grounding.candidate", {
																						index: index + 1,
																					})}
																			</span>
																			<Tag>
																				{t(
																					`computer.grounding.statuses.${candidate.status}`,
																				)}
																			</Tag>
																		</Button>
																		<Typography.Paragraph
																			type="secondary"
																			className={styles.candidateDetails}
																		>
																			{t(
																				"computer.grounding.box",
																				candidate.box,
																			)}
																			{candidate.status === "matched" && (
																				<>
																					<br />
																					{t("computer.grounding.nodeId")}:{" "}
																					<code>{candidate.nodeId}</code>
																					<br />
																					{t(
																						"computer.grounding.supportedActions",
																					)}
																					:{" "}
																					<code>
																						{candidate.supportedActions.join(
																							", ",
																						)}
																					</code>
																				</>
																			)}
																		</Typography.Paragraph>
																	</li>
																))}
															</ol>
														)}
													</section>
												))}
										</div>
									),
								},
							]),
				]}
			/>
		</>
	);
}
