import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Typography } from "antd";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Icon } from "@/assets/icons";
import styles from "./TerminalPanel.module.css";

type TerminalPanelProps = {
	terminalId: string;
	cwd: string | null;
	isOpen: boolean;
	waitForCwd: boolean;
};

type TerminalDimensions = {
	cols: number;
	rows: number;
};

type Disposable = {
	dispose: () => void;
};

const DEFAULT_TERMINAL_DIMENSIONS: TerminalDimensions = {
	cols: 80,
	rows: 24
};

function getCssVar(name: string, fallback: string): string {
	const value: string = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return value.length > 0 ? value : fallback;
}

function createTerminalTheme(): Record<string, string> {
	const isLightTheme: boolean = document.documentElement.dataset.theme === "light";
	return {
		background: getCssVar("--ds-bg-sunken", "#0f0f0f"),
		foreground: getCssVar("--ds-text-primary", "#e8e8e8"),
		cursor: getCssVar("--ds-accent", "#478cbf"),
		selectionBackground: getCssVar("--ds-accent-muted", "rgb(71 140 191 / 24%)"),
		black: isLightTheme ? getCssVar("--ds-text-primary", "#141414") : getCssVar("--ds-bg", "#141414"),
		red: getCssVar("--ds-danger", "#ff4d4f"),
		green: getCssVar("--ds-success", "#52c41a"),
		yellow: getCssVar("--ds-warning", "#faad14"),
		blue: getCssVar("--ds-accent", "#478cbf"),
		magenta: "#c678dd",
		cyan: "#56b6c2",
		white: getCssVar("--ds-text-primary", "#e8e8e8"),
		brightBlack: isLightTheme ? getCssVar("--ds-text-secondary", "#4f4f4f") : getCssVar("--ds-text-muted", "#8c8c8c"),
		brightRed: getCssVar("--ds-danger", "#ff4d4f"),
		brightGreen: getCssVar("--ds-success", "#52c41a"),
		brightYellow: getCssVar("--ds-warning", "#faad14"),
		brightBlue: getCssVar("--ds-accent-hover", "#5aa0d2"),
		brightMagenta: "#d19aef",
		brightCyan: "#66d9ef",
		brightWhite: getCssVar("--ds-text-inverse", "#ffffff")
	};
}

function formatShellName(shell: string): string {
	return shell.split(/[\\/]/u).filter((part: string): boolean => part.length > 0).at(-1) ?? shell;
}

function getTerminalStateLabel(state: TerminalState | null, isCreating: boolean, isWaitingForCwd: boolean): string {
	if (isWaitingForCwd) {
		return "Waiting for workspace";
	}
	if (isCreating) {
		return "Starting";
	}
	if (state === null) {
		return "Not started";
	}
	return state.running ? "Running" : "Stopped";
}

function TerminalPanel({ terminalId, cwd, isOpen, waitForCwd }: TerminalPanelProps): React.JSX.Element {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const terminalStateRef = useRef<TerminalState | null>(null);
	const inputDisposableRef = useRef<Disposable | null>(null);
	const isRestartingRef = useRef<boolean>(false);
	const cwdRef = useRef<string | null>(cwd);
	const isOpenRef = useRef<boolean>(isOpen);
	const waitForCwdRef = useRef<boolean>(waitForCwd);
	const [terminalState, setTerminalState] = useState<TerminalState | null>(null);
	const [isCreating, setIsCreating] = useState<boolean>(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const syncTerminalState = useCallback((nextState: TerminalState | null): void => {
		terminalStateRef.current = nextState;
		setTerminalState(nextState);
	}, []);

	useEffect((): void => {
		cwdRef.current = cwd;
	}, [cwd]);

	useEffect((): void => {
		isOpenRef.current = isOpen;
	}, [isOpen]);

	useEffect((): void => {
		waitForCwdRef.current = waitForCwd;
	}, [waitForCwd]);

	const fitTerminal = useCallback((notifyPty: boolean): TerminalDimensions => {
		const terminal: Terminal | null = terminalRef.current;
		const fitAddon: FitAddon | null = fitAddonRef.current;
		const host: HTMLDivElement | null = hostRef.current;
		if (terminal === null || fitAddon === null || host === null || host.clientWidth <= 0 || host.clientHeight <= 0) {
			return terminal === null
				? DEFAULT_TERMINAL_DIMENSIONS
				: { cols: terminal.cols, rows: terminal.rows };
		}

		try {
			fitAddon.fit();
		} catch (error: unknown) {
			console.error("[TerminalPanel] failed to fit terminal", error);
		}

		const dimensions: TerminalDimensions = {
			cols: terminal.cols,
			rows: terminal.rows
		};
		const state: TerminalState | null = terminalStateRef.current;
		if (notifyPty && state !== null && state.running) {
			void window.electronAPI.terminal.resize({
				terminalId: state.terminalId,
				cols: dimensions.cols,
				rows: dimensions.rows
			}).catch((error: unknown): void => {
				console.error("[TerminalPanel] failed to resize terminal pty", error);
			});
		}

		return dimensions;
	}, []);

	const ensureTerminal = useCallback(async (): Promise<void> => {
		if (terminalRef.current === null) {
			return;
		}

		setIsCreating(true);
		setErrorMessage(null);
		try {
			const dimensions: TerminalDimensions = fitTerminal(false);
			const existingState: TerminalState | null = await window.electronAPI.terminal.getState({ terminalId });
			if (existingState !== null && existingState.running) {
				syncTerminalState(existingState);
				void window.electronAPI.terminal.resize({
					terminalId: existingState.terminalId,
					cols: dimensions.cols,
					rows: dimensions.rows
				}).catch((error: unknown): void => {
					console.error("[TerminalPanel] failed to resize existing terminal pty", error);
				});
				terminalRef.current.focus();
				return;
			}

			if (waitForCwdRef.current && cwdRef.current === null) {
				return;
			}

			const nextState: TerminalState = await window.electronAPI.terminal.create({
				terminalId,
				cwd: cwdRef.current,
				cols: dimensions.cols,
				rows: dimensions.rows
			});
			syncTerminalState(nextState);
			terminalRef.current.focus();
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to start terminal.";
			console.error("[TerminalPanel] failed to create terminal", error);
			setErrorMessage(message);
		} finally {
			setIsCreating(false);
		}
	}, [fitTerminal, syncTerminalState, terminalId]);

	const killTerminal = useCallback(async (): Promise<void> => {
		const state: TerminalState | null = terminalStateRef.current;
		if (state === null) {
			return;
		}

		setErrorMessage(null);
		try {
			await window.electronAPI.terminal.kill({ terminalId: state.terminalId });
			syncTerminalState({ ...state, running: false });
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to stop terminal.";
			console.error("[TerminalPanel] failed to kill terminal", error);
			setErrorMessage(message);
		}
	}, [syncTerminalState]);

	const restartTerminal = useCallback(async (): Promise<void> => {
		const terminal: Terminal | null = terminalRef.current;
		const state: TerminalState | null = terminalStateRef.current;
		isRestartingRef.current = true;
		setErrorMessage(null);
		try {
			if (state !== null) {
				await window.electronAPI.terminal.kill({ terminalId: state.terminalId });
			}
			terminal?.reset();
			syncTerminalState(null);
			await ensureTerminal();
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to restart terminal.";
			console.error("[TerminalPanel] failed to restart terminal", error);
			setErrorMessage(message);
		} finally {
			isRestartingRef.current = false;
		}
	}, [ensureTerminal, syncTerminalState]);

	useEffect((): (() => void) | void => {
		const host: HTMLDivElement | null = hostRef.current;
		if (host === null || terminalRef.current !== null) {
			return;
		}

		const terminal = new Terminal({
			allowProposedApi: false,
			convertEol: true,
			cursorBlink: true,
			fontFamily: getCssVar("--ds-font-family-code", "Cascadia Code, Consolas, monospace"),
			fontSize: 13,
			lineHeight: 1.18,
			scrollback: 6000,
			theme: createTerminalTheme()
		});
		const fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.open(host);
		inputDisposableRef.current = terminal.onData((data: string): void => {
			const state: TerminalState | null = terminalStateRef.current;
			if (state === null || !state.running) {
				return;
			}
			void window.electronAPI.terminal.write({
				terminalId: state.terminalId,
				data
			}).catch((error: unknown): void => {
				console.error("[TerminalPanel] failed to write terminal input", error);
			});
		});

		terminalRef.current = terminal;
		fitAddonRef.current = fitAddon;
		if (isOpenRef.current) {
			void ensureTerminal();
		}

		return (): void => {
			inputDisposableRef.current?.dispose();
			inputDisposableRef.current = null;
			terminal.dispose();
			terminalRef.current = null;
			fitAddonRef.current = null;
		};
	}, [ensureTerminal]);

	useEffect((): (() => void) => {
		const unsubscribeData = window.electronAPI.terminal.onData((event: TerminalDataEvent): void => {
			const state: TerminalState | null = terminalStateRef.current;
			if (state === null || event.terminalId !== state.terminalId) {
				return;
			}
			terminalRef.current?.write(event.data);
		});
		const unsubscribeExit = window.electronAPI.terminal.onExit((event: TerminalExitEvent): void => {
			if (isRestartingRef.current) {
				return;
			}
			const state: TerminalState | null = terminalStateRef.current;
			if (state === null || event.terminalId !== state.terminalId) {
				return;
			}
			syncTerminalState({ ...state, running: false });
		});

		return (): void => {
			unsubscribeData();
			unsubscribeExit();
		};
	}, [syncTerminalState]);

	useEffect((): (() => void) => {
		const observer = new MutationObserver((mutations: MutationRecord[]): void => {
			if (!mutations.some((mutation: MutationRecord): boolean => mutation.attributeName === "data-theme")) {
				return;
			}
			const terminal: Terminal | null = terminalRef.current;
			if (terminal !== null) {
				terminal.options.theme = createTerminalTheme();
			}
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"]
		});

		return (): void => {
			observer.disconnect();
		};
	}, []);

	useEffect((): void => {
		if (!isOpen) {
			return;
		}
		void ensureTerminal();
		window.requestAnimationFrame((): void => {
			fitTerminal(true);
			terminalRef.current?.focus();
		});
	}, [cwd, ensureTerminal, fitTerminal, isOpen, waitForCwd]);

	useEffect((): (() => void) | void => {
		const host: HTMLDivElement | null = hostRef.current;
		if (host === null) {
			return;
		}

		let animationFrameId: number | null = null;
		const observer = new ResizeObserver((): void => {
			if (!isOpen) {
				return;
			}
			if (animationFrameId !== null) {
				window.cancelAnimationFrame(animationFrameId);
			}
			animationFrameId = window.requestAnimationFrame((): void => {
				animationFrameId = null;
				fitTerminal(true);
			});
		});
		observer.observe(host);

		return (): void => {
			if (animationFrameId !== null) {
				window.cancelAnimationFrame(animationFrameId);
			}
			observer.disconnect();
		};
	}, [fitTerminal, isOpen]);

	const isWaitingForCwd: boolean = waitForCwd && cwd === null && terminalState === null;
	const stateLabel: string = getTerminalStateLabel(terminalState, isCreating, isWaitingForCwd);
	const shellLabel: string = terminalState === null ? "PowerShell" : formatShellName(terminalState.shell);
	const cwdLabel: string = terminalState?.cwd ?? cwd ?? "Home";
	const canKill: boolean = terminalState !== null && terminalState.running && !isCreating;

	return (
		<section className={styles.panel}>
			<header className={styles.toolbar}>
				<div className={styles.statusGroup}>
					<span className={styles.status}>{stateLabel}</span>
				</div>
				<div></div>
				{/* <div className={styles.metaGroup}>
					<Typography.Text className={styles.shellLabel} title={terminalState?.shell ?? shellLabel}>
						{shellLabel}
					</Typography.Text>
					<Typography.Text className={styles.cwdLabel} title={cwdLabel}>
						{cwdLabel}
					</Typography.Text>
				</div> */}
				<div className={styles.actions}>
					<Button
						type="text"
						shape="circle"
						aria-label="Restart terminal"
						disabled={isCreating || isWaitingForCwd}
						icon={<Icon name="reload" />}
						onClick={(): void => {
							void restartTerminal();
						}}
					/>
					<Button
						type="text"
						shape="circle"
						aria-label="Stop terminal"
						disabled={!canKill}
						icon={<Icon name="stop" />}
						onClick={(): void => {
							void killTerminal();
						}}
					/>
				</div>
			</header>
			{errorMessage !== null ? (
				<div className={styles.errorLine}>{errorMessage}</div>
			) : null}
			<div className={styles.terminalHost} ref={hostRef} />
		</section>
	);
}

export default TerminalPanel;
