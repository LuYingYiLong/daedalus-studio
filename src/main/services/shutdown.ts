export type ShutdownStep = {
	name: string;
	timeoutMs: number;
	run: () => void | Promise<void>;
	force: () => void;
};

/** 清理失败不能跳过后续资源，也不能无限阻止应用退出 */
export async function runShutdownSteps(
	steps: readonly ShutdownStep[],
	onFailure: (name: string) => void,
): Promise<void> {
	for (const step of steps) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				Promise.resolve().then(step.run),
				new Promise<never>((_resolve, reject): void => {
					timer = setTimeout((): void => reject(new Error("shutdown_timeout")), step.timeoutMs);
				}),
			]);
		} catch {
			try { onFailure(step.name); } catch { /* 日志失败不能阻断退出 */ }
			try { step.force(); } catch { /* 继续释放其他独立资源 */ }
		} finally {
			clearTimeout(timer);
		}
	}
}
