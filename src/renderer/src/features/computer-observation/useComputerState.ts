import { useEffect, useState } from "react";
import { getPlatformRuntime } from "@/platform/runtime/platform-runtime";
import {
	GENERAL_SETTINGS_CHANGED_EVENT,
	type GeneralSettings,
} from "@/platform/rpc/general-settings-api";
import type { ComputerState } from "../../../../contracts/computer-observation";
import { createBackendClient } from "@/platform/rpc/transport/backend-client";
export function useComputerState() {
	const api = getPlatformRuntime().system?.computerObservation;
	const [state, setState] = useState<ComputerState | null>(null);
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api
			.getState()
			.then((value) => {
				if (active) setState(value);
			})
			.catch(() => {});
		const dispose = api.onState(setState);
		return () => {
			active = false;
			dispose();
		};
	}, [api]);
	return { api, state };
}
export function useComputerDeveloperMode(): boolean {
	const api = getPlatformRuntime().system?.computerObservation;
	const [enabled, setEnabled] = useState(false);
	useEffect(() => {
		if (!api) return;
		let active = true;
		const changed = (event: Event): void =>
			setEnabled(
				(event as CustomEvent<GeneralSettings>).detail.developerMode,
			);
		window.addEventListener(GENERAL_SETTINGS_CHANGED_EVENT, changed);
		const dispose = window.electronAPI?.generalSettings?.onChanged(
			(value) => {
				if (active) setEnabled(value.developerMode);
			},
		);
		// 只读挂载不能广播设置变化，否则会重置正在查看的轨迹选中项
		void createBackendClient()
			.then((client) =>
				client.request<GeneralSettings>("generalSettings.get"),
			)
			.then((value) => {
				if (active) setEnabled(value.developerMode);
			})
			.catch(() => {});
		return () => {
			active = false;
			dispose?.();
			window.removeEventListener(GENERAL_SETTINGS_CHANGED_EVENT, changed);
		};
	}, [api]);
	return !!api && enabled;
}
