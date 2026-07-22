import { type CSSProperties, type ReactNode } from "react";
import { closestCenter, DndContext, PointerSensor, useSensor, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Tooltip, Typography } from "antd";
import { Icon } from "@/assets/icons";
import type { MessageQueueItem, PendingGuide } from "@/api/types";
import styles from "./MessageQueuePanel.module.css";

type MessageQueuePanelProps = {
	messageQueue: MessageQueueItem[];
	pendingGuides: PendingGuide[];
	activeQueueItemId?: number | null;
	onQueueReorder: (queueIds: number[]) => void;
	onQueueRemove: (queueId: number) => void;
	onQueueEdit: (item: MessageQueueItem) => void;
	onGuideReorder: (guideIds: string[]) => void;
	onGuideDelete: (guideId: string) => void;
};

type SortableRowProps = {
	id: string;
	disabled?: boolean;
	icon: ReactNode;
	text: string;
	onEdit?: () => void;
	onRemove: () => void;
};

function joinClassNames(...classNames: Array<string | false | undefined>): string {
	return classNames.filter((className): className is string => typeof className === "string" && className.length > 0).join(" ");
}

function moveBefore<T>(items: T[], activeItem: T, overItem: T): T[] {
	const activeIndex: number = items.indexOf(activeItem);
	const overIndex: number = items.indexOf(overItem);
	if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
		return items;
	}
	const nextItems: T[] = [...items];
	nextItems.splice(activeIndex, 1);
	nextItems.splice(overIndex, 0, activeItem);
	return nextItems;
}

function QueueRow({ icon, text, onEdit, onRemove, dragHandle, rowRef, style, isDragging }: SortableRowProps & {
	dragHandle: ReactNode;
	rowRef?: (node: HTMLDivElement | null) => void;
	style?: CSSProperties;
	isDragging?: boolean;
}): React.JSX.Element {
	return (
		<div
			ref={rowRef}
			className={joinClassNames(styles.item, isDragging && styles.itemDragging)}
			style={style}
		>
			{dragHandle}
			<span className={styles.kindIcon}>{icon}</span>
			<div className={styles.itemBody}>
				<Tooltip title={text}>
					<Typography.Text className={styles.itemText}>{text}</Typography.Text>
				</Tooltip>
			</div>
			{onEdit === undefined ? <span aria-hidden={true} /> : (
				<Tooltip title="Edit">
					<Button
						type="text"
						size="small"
						shape="circle"
						icon={<Icon name="pencil" />}
						className={styles.actionButton}
						onClick={onEdit}
					/>
				</Tooltip>
			)}
			<Tooltip title="Remove">
				<Button
					type="text"
					size="small"
					shape="circle"
					icon={<Icon name="close" />}
					className={styles.actionButton}
					onClick={onRemove}
				/>
			</Tooltip>
		</div>
	);
}

function StaticQueueRow(props: SortableRowProps): React.JSX.Element {
	return (
		<QueueRow
			{...props}
			dragHandle={(
				<span className={joinClassNames(styles.dragHandle, styles.dragHandleDisabled)} aria-hidden={true}>
					<Icon name="draggable" />
				</span>
			)}
		/>
	);
}

function SortableQueueRow(props: SortableRowProps): React.JSX.Element {
	const {
		attributes,
		listeners,
		setActivatorNodeRef,
		setNodeRef,
		transform,
		transition,
		isDragging
	} = useSortable({ id: props.id, disabled: props.disabled === true });
	const style: CSSProperties = {
		transform: CSS.Translate.toString(transform),
		transition
	};

	if (props.disabled === true) {
		return <StaticQueueRow {...props} />;
	}

	return (
		<QueueRow
			{...props}
			rowRef={setNodeRef}
			style={style}
			isDragging={isDragging}
			dragHandle={(
				<button
					ref={setActivatorNodeRef}
					type="button"
					className={styles.dragHandle}
					aria-label="Drag to reorder"
					{...attributes}
					{...listeners}
				>
					<Icon name="draggable" />
				</button>
			)}
		/>
	);
}

function shouldShowQueueItem(item: MessageQueueItem, activeQueueItemId: number | null | undefined): boolean {
	return item.id !== activeQueueItemId && item.status !== "sending" && item.status !== "approval";
}

function MessageQueuePanel({
	messageQueue,
	pendingGuides,
	activeQueueItemId = null,
	onQueueReorder,
	onQueueRemove,
	onQueueEdit,
	onGuideReorder,
	onGuideDelete
}: MessageQueuePanelProps): React.JSX.Element | null {
	const pointerSensor = useSensor(PointerSensor, {
		activationConstraint: {
			distance: 8
		}
	});
	const visibleMessageQueue: MessageQueueItem[] = messageQueue.filter((item: MessageQueueItem): boolean => {
		return shouldShowQueueItem(item, activeQueueItemId);
	});
	const pendingQueueIds: string[] = visibleMessageQueue
		.filter((item: MessageQueueItem): boolean => item.status === "pending")
		.map((item: MessageQueueItem): string => String(item.id));
	const guideIds: string[] = pendingGuides.map((guide: PendingGuide): string => guide.guideId);

	function handleQueueDragEnd(event: DragEndEvent): void {
		if (event.over === null || event.active.id === event.over.id) {
			return;
		}
		const nextIds: string[] = moveBefore(pendingQueueIds, String(event.active.id), String(event.over.id));
		onQueueReorder(nextIds.map((queueId: string): number => Number(queueId)));
	}

	function handleGuideDragEnd(event: DragEndEvent): void {
		if (event.over === null || event.active.id === event.over.id) {
			return;
		}
		onGuideReorder(moveBefore(guideIds, String(event.active.id), String(event.over.id)));
	}

	if (visibleMessageQueue.length === 0 && pendingGuides.length === 0) {
		return null;
	}

	return (
		<div className={styles.panel}>
			{pendingGuides.length > 0 ? (
				<DndContext sensors={[pointerSensor]} collisionDetection={closestCenter} onDragEnd={handleGuideDragEnd}>
					<SortableContext items={guideIds} strategy={verticalListSortingStrategy}>
						<div className={styles.group}>
							<div className={styles.groupLabel}>Guides</div>
							{pendingGuides.map((guide: PendingGuide): React.ReactNode => (
								<SortableQueueRow
									key={guide.guideId}
									id={guide.guideId}
									icon={<Icon name="guide" />}
									text={guide.text}
									onRemove={(): void => onGuideDelete(guide.guideId)}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			) : null}
			{visibleMessageQueue.length > 0 ? (
				<DndContext sensors={[pointerSensor]} collisionDetection={closestCenter} onDragEnd={handleQueueDragEnd}>
					<SortableContext items={pendingQueueIds} strategy={verticalListSortingStrategy}>
						<div className={styles.group}>
							<div className={styles.groupLabel}>Queue</div>
							{visibleMessageQueue.map((item: MessageQueueItem): React.ReactNode => (
								<SortableQueueRow
									key={item.id}
									id={String(item.id)}
									disabled={item.status !== "pending"}
									icon={<Icon name="send" />}
									text={item.text}
									onEdit={(): void => onQueueEdit(item)}
									onRemove={(): void => onQueueRemove(item.id)}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			) : null}
		</div>
	);
}

export default MessageQueuePanel;
