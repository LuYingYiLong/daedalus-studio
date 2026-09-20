import { Button, Input, InputNumber, Space, Table, Typography } from "antd";
import { useTranslation } from "react-i18next";

type Row = { id: string; prompt: string; negativePrompt: string; seed?: number; width: number; height: number; count: number };
export function FlowParameterSetsEditor({ value, disabled, onChange }: { value: unknown; disabled: boolean; onChange: (rows: Row[]) => void }): React.JSX.Element {
	const { t } = useTranslation();
	const rows = Array.isArray(value) ? value as Row[] : [];
	const create = (prompt = ""): Row => ({ id: crypto.randomUUID(), prompt, negativePrompt: "", width: 1024, height: 1024, count: 1 });
	const update = (id: string, patch: Partial<Row>): void => onChange(rows.map(row => row.id === id ? { ...row, ...patch } : row));
	const count = rows.reduce((sum, row) => sum + row.count, 0);
	return <div className="nodrag nowheel" style={{ minWidth: 0, width: "100%" }}>
		<Typography.Text type={count > 100 ? "danger" : "secondary"}>{t("flow.batch.plan", { requests: rows.length, images: count })}</Typography.Text>
		<Table<Row> size="small" rowKey="id" dataSource={rows} pagination={{ pageSize: 5, size: "small" }} scroll={{ x: 750 }} columns={[
			...(["prompt", "negativePrompt"] as const).map(key => ({ title: t(`flow.batch.${key}`), key, width: 180, render: (_: unknown, row: Row) => <Input.TextArea aria-label={t(`flow.batch.${key}`)} disabled={disabled} value={row[key]} autoSize={{ minRows: 1, maxRows: 4 }} onChange={event => update(row.id, { [key]: event.target.value })} onPaste={event => {
				if (key !== "prompt") return;
				const lines = event.clipboardData.getData("text").split(/\r?\n/u).filter(line => line.trim());
				if (lines.length <= 1) return;
				event.preventDefault();
				const index = rows.findIndex(item => item.id === row.id);
				const inserted = lines.slice(0, 51 - rows.length).map((prompt, line) => ({ ...row, id: line === 0 ? row.id : crypto.randomUUID(), prompt }));
				onChange([...rows.slice(0, index), ...inserted, ...rows.slice(index + 1)]);
			}} /> })),
			...(["seed", "width", "height", "count"] as const).map(key => ({ title: t(`flow.batch.${key}`), key, width: 100, render: (_: unknown, row: Row) => <InputNumber aria-label={t(`flow.batch.${key}`)} disabled={disabled} style={{ width: "100%" }} min={key === "seed" ? 0 : 1} max={key === "seed" ? 2147483647 : key === "count" ? 4 : 16000} precision={0} value={row[key]} onChange={next => {
				if (next !== null) update(row.id, { [key]: next });
				else if (key === "seed") onChange(rows.map(item => { if (item.id !== row.id) return item; const { seed: _, ...rest } = item; return rest; }));
			}} /> })),
			{ key: "actions", width: 120, render: (_, row) => <Space><Button disabled={disabled || rows.length >= 50} onClick={() => onChange([...rows, { ...row, id: crypto.randomUUID() }])}>{t("flow.batch.duplicate")}</Button><Button disabled={disabled} onClick={() => onChange(rows.filter(item => item.id !== row.id))}>{t("flow.batch.remove")}</Button></Space> },
		]} />
		<Button disabled={disabled || rows.length >= 50} onClick={() => onChange([...rows, create()])}>{t("flow.batch.add")}</Button>
	</div>;
}
