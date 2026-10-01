import type { TimelineBodyPart } from "@/platform/rpc/types";
import { Icon } from "@/assets/icons";
import { Alert, Button, Card, Modal, Spin, Tooltip } from "antd";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { copyTextToClipboard } from "@/platform/electron/clipboard";
import { getPlan, updatePlan, type PlanResult } from "@/platform/rpc/plan-api";
import MarkdownContent from "../markdown/MarkdownContent";
import PlanMarkdownEditor from "./PlanMarkdownEditor";
import styles from "./PlanPart.module.css";

export type TimelinePlanPart = Extract<TimelineBodyPart, { type: "plan" }>;
export type PlanPartProps = { part: TimelinePlanPart };

function PlanPart({ part }: PlanPartProps): React.JSX.Element {
	const { t } = useTranslation();
	const [modalOpen, setModalOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [loadedPlan, setLoadedPlan] = useState<PlanResult | null>(null);
	const [draft, setDraft] = useState("");
	const [savedMarkdown, setSavedMarkdown] = useState("");
	const [preview, setPreview] = useState(part.previewMarkdown);
	const dirty = draft !== savedMarkdown;
	const editStateRef = useRef({ draft, savedMarkdown, loadedPlan });
	editStateRef.current = { draft, savedMarkdown, loadedPlan };
	const editable = loadedPlan?.status === "ready" && part.status === "ready" && !loading && error === null;
	const title = part.status === "streaming" ? t("chat.plan.drafting") : part.title;

	useEffect((): void => {
		setPreview(part.previewMarkdown);
	}, [part.planId, part.previewMarkdown]);

	useEffect((): (() => void) | void => {
		if (!modalOpen || part.status === "streaming") return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		void getPlan(part.planId)
			.then((plan: PlanResult): void => {
				if (cancelled) return;
				const current = editStateRef.current;
				if (
					current.loadedPlan !== null &&
					current.draft !== current.savedMarkdown &&
					current.loadedPlan.updatedAt !== plan.updatedAt
				) {
					setError(t("chat.plan.changed"));
					return;
				}
				setLoadedPlan(plan);
				setDraft(plan.markdown ?? "");
				setSavedMarkdown(plan.markdown ?? "");
				setPreview(plan.previewMarkdown);
			})
			.catch((cause: unknown): void => {
				if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
			})
			.finally((): void => {
				if (!cancelled) setLoading(false);
			});
		return (): void => {
			cancelled = true;
		};
	}, [modalOpen, part.planId, part.status, t]);

	const close = useCallback((): void => {
		if (saving) return;
		if (dirty) {
			Modal.confirm({
				title: t("chat.plan.discardTitle"),
				content: t("chat.plan.discardDescription"),
				onOk: (): void => {
					setDraft(savedMarkdown);
					setModalOpen(false);
				},
			});
			return;
		}
		setModalOpen(false);
	}, [dirty, savedMarkdown, saving, t]);

	async function save(): Promise<void> {
		if (loadedPlan === null || !editable || !dirty || !draft.trim()) return;
		setSaving(true);
		setError(null);
		try {
			const saved = await updatePlan(loadedPlan.planId, loadedPlan.sessionId, loadedPlan.updatedAt, draft);
			setLoadedPlan(saved);
			setDraft(saved.markdown ?? draft);
			setSavedMarkdown(saved.markdown ?? draft);
			setPreview(saved.previewMarkdown);
			setModalOpen(false);
		} catch (cause: unknown) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSaving(false);
		}
	}

	async function copyPlan(): Promise<void> {
		try {
			const markdown =
				part.status === "streaming"
					? (part.draftMarkdown ?? preview)
					: ((await getPlan(part.planId)).markdown ?? preview);
			await copyTextToClipboard(markdown);
			setCopied(true);
			window.setTimeout((): void => setCopied(false), 1200);
		} catch (cause: unknown) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}

	function openPlan(): void {
		setError(null);
		setLoading(part.status !== "streaming");
		setModalOpen(true);
	}

	return (
		<div>
			<Card
				title={title}
				extra={
					<div>
						<Tooltip title={t("chat.plan.open")}>
							<Button
								shape="circle"
								type="text"
								icon={<Icon name="distraction-free" />}
								onClick={openPlan}
							/>
						</Tooltip>
						<Tooltip title={copied ? t("chat.common.copied") : t("chat.common.copy")}>
							<Button
								shape="circle"
								type="text"
								icon={<Icon name="copy" />}
								onClick={(): void => {
									void copyPlan();
								}}
							/>
						</Tooltip>
					</div>
				}
				className={styles.planCard}
				classNames={{ body: styles.planCardBody }}
			>
				<div className={`${styles.markdownPreview} markdown-body`}>
					<MarkdownContent streaming={part.status === "streaming"}>{preview}</MarkdownContent>
				</div>
			</Card>
			<Modal
				title={title}
				open={modalOpen}
				width="min(1000px, 94vw)"
				footer={
					<div className={styles.actions}>
						<Button onClick={close}>{t("chat.plan.cancel")}</Button>
						{editable ? (
							<Button
								type="primary"
								loading={saving}
								disabled={!dirty || !draft.trim()}
								onClick={(): void => {
									void save();
								}}
							>
								{t("chat.plan.save")}
							</Button>
						) : null}
					</div>
				}
				onCancel={close}
				destroyOnHidden={true}
			>
				{error ? <Alert type="error" showIcon title={error} className={styles.error} /> : null}
				<div className={styles.modalEditor}>
					{loading ? (
						<Spin className={styles.loading} />
					) : (
						<PlanMarkdownEditor
							planId={part.planId}
							value={part.status === "streaming" && !dirty ? (part.draftMarkdown ?? "") : draft}
							readOnly={!editable || saving}
							onChange={setDraft}
						/>
					)}
				</div>
			</Modal>
		</div>
	);
}

export default React.memo(PlanPart);
