import type { ConceptVideoCopy } from "./copy";

export type StudioThemeName = "light" | "dark";
export type StudioShellActiveItem = "home" | "recent";

type StudioTheme = {
	window: string;
	windowText: string;
	windowMuted: string;
	sidebar: string;
	sidebarText: string;
	sidebarMuted: string;
	surface: string;
	surfaceText: string;
	muted: string;
	line: string;
	active: string;
	activeText: string;
	control: string;
	controlLine: string;
	composer: string;
	composerLine: string;
	accent: string;
};

export const STUDIO_THEMES: Record<StudioThemeName, StudioTheme> = {
	light: {
		window: "#d8d8d8",
		windowText: "#1e1e1e",
		windowMuted: "#858585",
		sidebar: "#d0d0d0",
		sidebarText: "#202020",
		sidebarMuted: "#8b8b8b",
		surface: "#fbfbfb",
		surfaceText: "#181818",
		muted: "#707070",
		line: "#dddddd",
		active: "#b7cbd9",
		activeText: "#171717",
		control: "#ffffff",
		controlLine: "#d6d6d6",
		composer: "#ffffff",
		composerLine: "#d2d2d2",
		accent: "#4d92c6"
	},
	dark: {
		window: "#353535",
		windowText: "#f1f1f1",
		windowMuted: "#9c9c9c",
		sidebar: "#373737",
		sidebarText: "#f2f2f2",
		sidebarMuted: "#858585",
		surface: "#1f1f1f",
		surfaceText: "#f2f2f2",
		muted: "#a2a2a2",
		line: "#343434",
		active: "#4a6070",
		activeText: "#ffffff",
		control: "#212121",
		controlLine: "#3b3b3b",
		composer: "#1f1f1f",
		composerLine: "#3a3a3a",
		accent: "#72add3"
	}
};

type StudioShellProps = {
	copy: ConceptVideoCopy;
	theme: StudioThemeName;
	title: string;
	activeItem: StudioShellActiveItem;
	children: React.ReactNode;
};

function SidebarSectionTitle({ children, theme }: { children: React.ReactNode; theme: StudioTheme }): React.JSX.Element {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 7, margin: "13px 9px 7px", color: theme.sidebarText, fontSize: 13, fontWeight: 650 }}>
			<span style={{ fontSize: 12, opacity: 0.9 }}>⌄</span>
			{children}
		</div>
	);
}

function SidebarRow({ children, theme, selected = false, icon }: { children: React.ReactNode; theme: StudioTheme; selected?: boolean; icon: string }): React.JSX.Element {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				minHeight: 29,
				padding: "3px 9px",
				borderRadius: 7,
				backgroundColor: selected ? theme.active : "transparent",
				color: selected ? theme.activeText : theme.sidebarText,
				fontSize: 13,
				fontWeight: selected ? 620 : 450,
				overflow: "hidden",
				whiteSpace: "nowrap",
				textOverflow: "ellipsis"
			}}
		>
			<span style={{ width: 15, color: selected ? theme.activeText : theme.sidebarText, fontSize: 14, textAlign: "center", flexShrink: 0 }}>{icon}</span>
			<span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{children}</span>
		</div>
	);
}

export function StudioShell({ copy, theme: themeName, title, activeItem, children }: StudioShellProps): React.JSX.Element {
	const theme: StudioTheme = STUDIO_THEMES[themeName];

	return (
		<div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", backgroundColor: theme.window, color: theme.windowText, fontFamily: "Segoe UI, Microsoft YaHei, sans-serif" }}>
			<div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", height: 31, padding: "0 12px", flexShrink: 0, color: theme.windowText }}>
				<div style={{ display: "flex", alignItems: "center", gap: 15, color: theme.windowMuted, fontSize: 14 }}>
					<span style={{ color: theme.windowText, fontSize: 13 }}>▣</span>
					<span>←</span>
					<span>→</span>
				</div>
				<div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 13, fontWeight: 550, letterSpacing: -0.1 }}>{copy.windowTitle}</div>
				<div style={{ display: "flex", alignItems: "center", gap: 18, color: theme.windowText, fontSize: 12 }}>
					<span>—</span>
					<span style={{ fontSize: 11 }}>□</span>
					<span style={{ fontSize: 16, lineHeight: 1 }}>×</span>
				</div>
			</div>

			<div style={{ display: "flex", flex: 1, minHeight: 0 }}>
				<aside style={{ display: "flex", width: 216, flexShrink: 0, flexDirection: "column", padding: "5px 11px 10px", color: theme.sidebarText, backgroundColor: theme.sidebar, overflow: "hidden" }}>
					<div style={{ margin: "0 0 9px", padding: "4px 9px", color: theme.sidebarText, fontSize: 15, fontWeight: 650 }}>＋ {copy.newSession}</div>
					<SidebarSectionTitle theme={theme}>{copy.pinned}</SidebarSectionTitle>
					<div style={{ padding: "7px 24px", color: theme.sidebarMuted, fontSize: 12 }}>{copy.noPinned}</div>
					<SidebarSectionTitle theme={theme}>{copy.projects}</SidebarSectionTitle>
					{copy.projectNames.map((projectName: string, index: number): React.JSX.Element => (
						<SidebarRow key={projectName} theme={theme} icon={index === 1 ? "□" : "▰"}>{projectName}</SidebarRow>
					))}
					<SidebarSectionTitle theme={theme}>{copy.recent}</SidebarSectionTitle>
					<SidebarRow theme={theme} selected={activeItem === "recent"} icon="▣">{copy.recentSession}</SidebarRow>
					<div style={{ marginTop: "auto", padding: "24px 9px 2px", color: theme.sidebarText, fontSize: 13 }}>⚙ {copy.settings}</div>
				</aside>

				<main style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0, margin: "0 8px 8px 0", overflow: "hidden", flexDirection: "column", border: `1px solid ${theme.line}`, borderRadius: 11, backgroundColor: theme.surface }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44, padding: "0 11px", flexShrink: 0, borderBottom: `1px solid ${theme.line}`, color: theme.surfaceText }}>
						<div style={{ maxWidth: "calc(100% - 30px)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 520 }}>{title}</div>
						<div style={{ color: theme.muted, fontSize: 18, letterSpacing: 1 }}>☷</div>
					</div>
					<div style={{ position: "relative", display: "flex", flex: 1, minHeight: 0, flexDirection: "column" }}>{children}</div>
				</main>
			</div>
		</div>
	);
}
