import "./status.css";
import type { NativeConnectionState } from "./native-connection";
const cn = navigator.language.startsWith("zh"),
	runtime = (
		globalThis as unknown as {
			chrome: {
				runtime: {
					sendMessage(
						message: unknown,
					): Promise<
						NativeConnectionState & { active: number; channel: string }
					>;
				};
			};
		}
	).chrome.runtime;
document.querySelector("#label")!.textContent = cn
	? "连接 Studio"
	: "Connect to Studio";
document.querySelector("#notice")!.textContent = cn
	? "请先在 Studio → 设置 → 浏览器中开启“允许外部浏览器任务”。勾选这里只表示允许连接；收到 Studio 握手确认后才显示“已连接”。仅执行对话中授权的步骤，页面内容可能发送给配置的模型。"
	: "First enable Allow external browser tasks in Studio → Settings → Browser. This checkbox only enables connection attempts; Connected means Studio confirmed the handshake. Only conversation-approved steps execute. Page content may be sent to your configured model.";
document.querySelector("#stop")!.textContent = cn ? "停止" : "Stop";
document.querySelector("#retry")!.textContent = cn ? "重新连接" : "Reconnect";
const errors: Record<string, [string, string]> = {
	browser_native_host_missing: [
		"未找到本地主机。请在 Studio 的浏览器设置中点击“注册主机并打开扩展目录”。",
		"Native host not found. Use Register host and open extension folder in Studio browser settings.",
	],
	browser_native_host_forbidden: [
		"浏览器拒绝连接本地主机。请核对开发版/正式版扩展是否匹配，并检查浏览器策略。",
		"The browser denied native host access. Check the extension channel and browser policies.",
	],
	browser_studio_unavailable: [
		"暂时无法连接 Studio。请确认对应版本的 Studio 正在运行，且已开启“允许外部浏览器任务”。",
		"Studio is unavailable. Check that the matching Studio is running and Allow external browser tasks is enabled.",
	],
	browser_handshake_timeout: [
		"未收到 Studio 握手确认。请更新并重启 Studio，同时重新加载扩展。",
		"Studio did not acknowledge the connection. Update and restart Studio, then reload the extension.",
	],
	browser_handshake_invalid: [
		"Studio 与扩展握手不兼容，请同时更新并重新加载。",
		"Studio and extension handshake mismatch. Update and reload both.",
	],
};
async function update(message: unknown = { method: "state" }): Promise<void> {
	try {
		const state = await runtime.sendMessage(message);
		(document.querySelector("#enabled") as HTMLInputElement).checked =
			state.enabled;
		document.querySelector("#state")!.textContent =
			`${state.connected ? (cn ? "已连接" : "Connected") : !state.enabled ? (cn ? "未启用连接" : "Connection disabled") : state.connecting ? (cn ? "正在连接 Studio…" : "Connecting to Studio…") : cn ? "未连接" : "Disconnected"} · ${state.active} ${cn ? "个活动标签页" : "active tabs"}`;
		const error = document.querySelector<HTMLElement>("#error")!;
		error.hidden = !state.error;
		error.textContent = state.error
			? errors[state.error]?.[cn ? 0 : 1] ||
				(cn
					? "扩展连接失败，请重新加载扩展后重试。"
					: "Extension connection failed. Reload the extension and retry.")
			: "";
		document.querySelector("#channel")!.textContent =
			state.channel === "development"
				? cn
					? "开发版扩展：连接 npm run dev 启动的 Studio"
					: "Development extension: connects to Studio started with npm run dev"
				: cn
					? "正式版扩展：连接已安装的 Studio"
					: "Stable extension: connects to installed Studio";
		(document.querySelector("#retry") as HTMLButtonElement).disabled =
			!state.enabled || state.connecting || state.connected;
		(document.querySelector("#stop") as HTMLButtonElement).disabled =
			state.active === 0;
	} catch {
		document.querySelector("#state")!.textContent = cn
			? "无法读取扩展状态，请重新加载扩展。"
			: "Unable to read extension status. Reload the extension.";
	}
}
document.querySelector("#enabled")!.addEventListener("change", (event) => {
	void update({
		method: "enable",
		enabled: (event.target as HTMLInputElement).checked,
	});
});
document.querySelector("#stop")!.addEventListener("click", () => {
	void update({ method: "stop" });
});
document.querySelector("#retry")!.addEventListener("click", () => {
	void update({ method: "retry" });
});
void update();
setInterval(() => {
	void update();
}, 1500);
