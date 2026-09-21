import { Button, ColorPicker, Input, InputNumber, Space, Switch } from "antd";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

type Props = {
	type: string;
	value: unknown;
	disabled: boolean;
	onChange: (value: unknown[]) => void;
	onOpenChange: (open: boolean) => void;
	itemKeys: readonly string[];
	onRemove: (index: number) => void;
	renderJson: (key: string, value: unknown, onChange: (value: unknown) => void) => ReactNode;
};

export function FlowListEditor({
	type,
	value,
	disabled,
	onChange,
	onOpenChange,
	itemKeys,
	onRemove,
	renderJson,
}: Props): React.JSX.Element {
	const { t } = useTranslation();
	const items = Array.isArray(value) ? value : [];
	const update = (index: number, next: unknown): void =>
		onChange(items.map((item, position) => (position === index ? next : item)));
	const initial = (): unknown =>
		({
			text: "",
			number: 0,
			boolean: false,
			color: { r: 1, g: 1, b: 1, a: 1 },
			size: { width: 1024, height: 1024 },
		})[type] ?? {};
	const editor = (item: unknown, index: number): ReactNode => {
		if (type === "text")
			return (
				<Input
					value={typeof item === "string" ? item : ""}
					disabled={disabled}
					onChange={(event) => update(index, event.target.value)}
				/>
			);
		if (type === "number")
			return (
				<InputNumber
					value={typeof item === "number" ? item : 0}
					disabled={disabled}
					onChange={(next) => {
						if (next !== null) update(index, next);
					}}
				/>
			);
		if (type === "boolean")
			return <Switch checked={item === true} disabled={disabled} onChange={(next) => update(index, next)} />;
		if (type === "color") {
			const color = item as { r?: number; g?: number; b?: number; a?: number } | null;
			return (
				<ColorPicker
					disabled={disabled}
					onOpenChange={onOpenChange}
					value={`rgba(${(color?.r ?? 1) * 255},${(color?.g ?? 1) * 255},${(color?.b ?? 1) * 255},${color?.a ?? 1})`}
					onChangeComplete={(next) => {
						const rgb = next.toRgb();
						update(index, { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255, a: rgb.a });
					}}
				/>
			);
		}
		if (type === "size") {
			const size = item as { width?: number; height?: number } | null;
			return (
				<Space.Compact>
					{(["width", "height"] as const).map((key) => (
						<InputNumber
							key={key}
							aria-label={t(`flow.batch.${key}`)}
							disabled={disabled}
							precision={0}
							min={1}
							max={16000}
							value={size?.[key] ?? 1024}
							onChange={(next) => {
								if (next !== null)
									update(index, {
										width: size?.width ?? 1024,
										height: size?.height ?? 1024,
										[key]: next,
									});
							}}
						/>
					))}
				</Space.Compact>
			);
		}
		return renderJson(itemKeys[index]!, item, (next) => update(index, next));
	};
	return (
		<div className="nodrag nowheel" style={{ maxHeight: 280, overflowY: "auto" }}>
			{items.map((item, index) => (
				<div key={itemKeys[index]} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
					<div style={{ flex: 1, minWidth: 0 }}>{editor(item, index)}</div>
					<Button
						disabled={disabled}
						onClick={() => {
							onRemove(index);
							onChange(items.filter((_, position) => position !== index));
						}}
					>
						{t("flow.batch.remove")}
					</Button>
				</div>
			))}
			<Button block disabled={disabled || items.length >= 100} onClick={() => onChange([...items, initial()])}>
				{t("flow.batch.add")}
			</Button>
		</div>
	);
}
