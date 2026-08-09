export type TimelineScrollFrameStage = "active_block" | "bottom_state" | "sticky_code_header" | "selection_overlay";

export type TimelineScrollFrameTask = () => void;

export type TimelineScrollFrameScheduler = {
	requestFrame: (callback: FrameRequestCallback) => number;
	cancelFrame: (handle: number) => void;
};

export type TimelineScrollFrameCoordinator = {
	subscribe: (stage: TimelineScrollFrameStage, task: TimelineScrollFrameTask) => () => void;
	schedule: () => void;
	cancel: () => void;
	dispose: () => void;
};

const TIMELINE_SCROLL_FRAME_STAGES: readonly TimelineScrollFrameStage[] = [
	"active_block",
	"bottom_state",
	"sticky_code_header",
	"selection_overlay"
];

const DEFAULT_SCHEDULER: TimelineScrollFrameScheduler = {
	requestFrame: (callback: FrameRequestCallback): number => window.requestAnimationFrame(callback),
	cancelFrame: (handle: number): void => window.cancelAnimationFrame(handle)
};

export function createTimelineScrollFrameCoordinator(
	scheduler: TimelineScrollFrameScheduler = DEFAULT_SCHEDULER
): TimelineScrollFrameCoordinator {
	const tasksByStage: Map<TimelineScrollFrameStage, Set<TimelineScrollFrameTask>> = new Map(
		TIMELINE_SCROLL_FRAME_STAGES.map((stage: TimelineScrollFrameStage): [TimelineScrollFrameStage, Set<TimelineScrollFrameTask>] => [stage, new Set()])
	);
	let frameHandle: number | null = null;
	let disposed: boolean = false;

	const flush = (): void => {
		frameHandle = null;
		if (disposed) {
			return;
		}
		for (const stage of TIMELINE_SCROLL_FRAME_STAGES) {
			const tasks: Set<TimelineScrollFrameTask> | undefined = tasksByStage.get(stage);
			if (tasks === undefined) {
				continue;
			}
			for (const task of tasks) {
				task();
			}
		}
	};
	const cancel = (): void => {
		if (frameHandle === null) {
			return;
		}
		scheduler.cancelFrame(frameHandle);
		frameHandle = null;
	};

	return {
		subscribe(stage: TimelineScrollFrameStage, task: TimelineScrollFrameTask): () => void {
			if (disposed) {
				return (): void => undefined;
			}
			const tasks: Set<TimelineScrollFrameTask> = tasksByStage.get(stage) as Set<TimelineScrollFrameTask>;
			tasks.add(task);
			return (): void => {
				tasks.delete(task);
			};
		},
			schedule(): void {
			if (disposed || frameHandle !== null) {
				return;
			}
			frameHandle = scheduler.requestFrame(flush);
		},
		cancel,
		dispose(): void {
			disposed = true;
			cancel();
			for (const tasks of tasksByStage.values()) {
				tasks.clear();
			}
		}
	};
}
