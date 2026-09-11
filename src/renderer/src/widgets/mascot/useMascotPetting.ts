import { useEffect, useRef, useState, type RefObject } from "react";

type PettingAxis = "x" | "y";

type PettingSession = {
	pointerId: number;
	lastX: number;
	lastY: number;
	axis: PettingAxis | null;
	direction: -1 | 1 | null;
	segmentDistance: number;
	reversals: number;
};

const PETTING_BUTTONS: ReadonlySet<number> = new Set([0, 1, 2]);
const MIN_STROKE_DISTANCE_PX: number = 9;
const REVERSALS_TO_ENJOY: number = 2;
const ENJOYING_HOLD_MS: number = 1400;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function setGazeToPointer(
	starRef: RefObject<HTMLDivElement | null>,
	gazeRef: RefObject<HTMLDivElement | null>,
	clientX: number,
	clientY: number,
): void {
	const star: HTMLDivElement | null = starRef.current;
	const gaze: HTMLDivElement | null = gazeRef.current;
	if (star === null || gaze === null) return;
	const rect: DOMRect = star.getBoundingClientRect();
	const dx: number = clientX - (rect.left + rect.width / 2);
	const dy: number = clientY - (rect.top + rect.height / 2);
	// 让眼睛尽量靠近抚摸位置，同时把眼睛组留在主星轮廓内
	const maxX: number = rect.width * 0.15;
	const maxY: number = rect.height * 0.2;
	gaze.style.setProperty("--gaze-x", `${clamp(dx, -maxX, maxX)}px`);
	gaze.style.setProperty("--gaze-y", `${clamp(dy, -maxY, maxY)}px`);
}

function resetGaze(gazeRef: RefObject<HTMLDivElement | null>): void {
	gazeRef.current?.style.removeProperty("--gaze-x");
	gazeRef.current?.style.removeProperty("--gaze-y");
}

/** 按住任意鼠标键在主星上来回移动时触发短暂的享受状态 */
export function useMascotPetting(
	starRef: RefObject<HTMLDivElement | null>,
	gazeRef: RefObject<HTMLDivElement | null>,
	enabled: boolean = true,
): boolean {
	const [enjoying, setEnjoying] = useState<boolean>(false);
	const enjoyingRef = useRef<boolean>(false);
	const holdTimerRef = useRef<number | null>(null);

	useEffect((): (() => void) | undefined => {
		const clearHoldTimer = (): void => {
			if (holdTimerRef.current === null) return;
			window.clearTimeout(holdTimerRef.current);
			holdTimerRef.current = null;
		};
		const setEnjoyingState = (next: boolean): void => {
			enjoyingRef.current = next;
			setEnjoying(next);
		};
		const finishEnjoying = (): void => {
			clearHoldTimer();
			setEnjoyingState(false);
			resetGaze(gazeRef);
		};

		if (!enabled) {
			finishEnjoying();
			return undefined;
		}

		const star: HTMLDivElement | null = starRef.current;
		if (star === null) return undefined;
		let session: PettingSession | null = null;

		const scheduleFinish = (): void => {
			if (!enjoyingRef.current) {
				resetGaze(gazeRef);
				return;
			}
			clearHoldTimer();
			holdTimerRef.current = window.setTimeout(finishEnjoying, ENJOYING_HOLD_MS);
		};
		const handlePointerDown = (event: PointerEvent): void => {
			if (!PETTING_BUTTONS.has(event.button) || session !== null) return;
			event.preventDefault();
			clearHoldTimer();
			session = {
				pointerId: event.pointerId,
				lastX: event.clientX,
				lastY: event.clientY,
				axis: null,
				direction: null,
				segmentDistance: 0,
				reversals: 0,
			};
			setGazeToPointer(starRef, gazeRef, event.clientX, event.clientY);
			try {
				star.setPointerCapture(event.pointerId);
			} catch {
				// 某些测试环境或非标准容器不提供指针捕获
			}
		};
		const handlePointerMove = (event: PointerEvent): void => {
			if (session === null || event.pointerId !== session.pointerId) return;
			event.preventDefault();
			setGazeToPointer(starRef, gazeRef, event.clientX, event.clientY);
			const dx: number = event.clientX - session.lastX;
			const dy: number = event.clientY - session.lastY;
			session.lastX = event.clientX;
			session.lastY = event.clientY;
			if (dx === 0 && dy === 0) return;
			const axis: PettingAxis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
			const projection: number = axis === "x" ? dx : dy;
			const direction: -1 | 1 = projection >= 0 ? 1 : -1;
			if (session.axis !== axis) {
				session.axis = axis;
				session.direction = direction;
				session.segmentDistance = Math.abs(projection);
				return;
			}
			if (session.direction === direction || session.direction === null) {
				session.segmentDistance += Math.abs(projection);
				return;
			}
			if (session.segmentDistance < MIN_STROKE_DISTANCE_PX) {
				// 过短的抖动不计作一次来回，但从新的方向重新累计距离
				session.direction = direction;
				session.segmentDistance = Math.abs(projection);
				return;
			}
			session.direction = direction;
			session.segmentDistance = Math.abs(projection);
			session.reversals += 1;
			if (session.reversals >= REVERSALS_TO_ENJOY) setEnjoyingState(true);
		};
		const handlePointerEnd = (event: PointerEvent): void => {
			if (session === null || event.pointerId !== session.pointerId) return;
			event.preventDefault();
			session = null;
			try {
				if (star.hasPointerCapture(event.pointerId)) star.releasePointerCapture(event.pointerId);
			} catch {
				// 某些测试环境或非标准容器不提供指针捕获
			}
			scheduleFinish();
		};
		const handleContextMenu = (event: MouseEvent): void => {
			event.preventDefault();
			event.stopPropagation();
		};

		star.addEventListener("pointerdown", handlePointerDown);
		star.addEventListener("pointermove", handlePointerMove);
		star.addEventListener("pointerup", handlePointerEnd);
		star.addEventListener("pointercancel", handlePointerEnd);
		star.addEventListener("lostpointercapture", handlePointerEnd);
		star.addEventListener("contextmenu", handleContextMenu);
		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerEnd);
		window.addEventListener("pointercancel", handlePointerEnd);
		return (): void => {
			star.removeEventListener("pointerdown", handlePointerDown);
			star.removeEventListener("pointermove", handlePointerMove);
			star.removeEventListener("pointerup", handlePointerEnd);
			star.removeEventListener("pointercancel", handlePointerEnd);
			star.removeEventListener("lostpointercapture", handlePointerEnd);
			star.removeEventListener("contextmenu", handleContextMenu);
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerEnd);
			window.removeEventListener("pointercancel", handlePointerEnd);
			clearHoldTimer();
			session = null;
			enjoyingRef.current = false;
			resetGaze(gazeRef);
		};
	}, [enabled, gazeRef, starRef]);

	return enjoying;
}
