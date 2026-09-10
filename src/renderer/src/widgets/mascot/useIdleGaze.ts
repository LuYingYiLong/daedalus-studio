import { useEffect, type RefObject } from "react";

/** 仅在空闲角色挂载且窗口聚焦时跟随视线，不触发 React 逐帧渲染 */
export function useIdleGaze(
	starRef: RefObject<HTMLDivElement | null>,
	gazeRef: RefObject<HTMLDivElement | null>,
): void {
	useEffect(() => {
		let focused: boolean = document.hasFocus();
		let frame: number | null = null;
		let pointer: { x: number; y: number } | null = null;

		const reset = (): void => {
			if (frame !== null) cancelAnimationFrame(frame);
			frame = null;
			pointer = null;
			gazeRef.current?.style.removeProperty("--gaze-x");
			gazeRef.current?.style.removeProperty("--gaze-y");
		};
		const update = (): void => {
			frame = null;
			if (!focused || document.hidden || !pointer) return;
			const star = starRef.current;
			const gaze = gazeRef.current;
			if (!star || !gaze) return;
			const rect = star.getBoundingClientRect();
			const dx = pointer.x - (rect.left + rect.width / 2);
			const dy = pointer.y - (rect.top + rect.height / 2);
			// 限制视线位移，让大眼睛始终留在主星轮廓内
			const distance = Math.max(160, Math.hypot(dx, dy));
			gaze.style.setProperty("--gaze-x", `${(dx / distance) * 12}px`);
			gaze.style.setProperty("--gaze-y", `${(dy / distance) * 16}px`);
		};
		const handlePointer = (event: PointerEvent): void => {
			if (!focused || document.hidden || event.pointerType === "touch") return;
			pointer = { x: event.clientX, y: event.clientY };
			if (frame === null) frame = requestAnimationFrame(update);
		};
		const handleFocus = (): void => {
			focused = true;
		};
		const handleBlur = (): void => {
			focused = false;
			reset();
		};
		const handleVisibility = (): void => {
			focused = !document.hidden && document.hasFocus();
			if (!focused) reset();
		};

		window.addEventListener("pointermove", handlePointer, { passive: true });
		window.addEventListener("focus", handleFocus);
		window.addEventListener("blur", handleBlur);
		document.addEventListener("visibilitychange", handleVisibility);
		document.documentElement.addEventListener("pointerleave", reset);
		return (): void => {
			window.removeEventListener("pointermove", handlePointer);
			window.removeEventListener("focus", handleFocus);
			window.removeEventListener("blur", handleBlur);
			document.removeEventListener("visibilitychange", handleVisibility);
			document.documentElement.removeEventListener("pointerleave", reset);
			reset();
		};
	}, [starRef, gazeRef]);
}
