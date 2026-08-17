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

type SidebarIconName = "arrow-down" | "folder-open" | "folder" | "square" | "file" | "layout-left" | "plus" | "settings";

function SidebarIcon({ name, color, size = 15 }: { name: SidebarIconName; color: string; size?: number }): React.JSX.Element {
	const commonProps = {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: color,
		strokeWidth: 1.8,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		"aria-hidden": true
	};

	if (name === "arrow-down") {
		return <svg {...commonProps}><path d="m6 9 6 6 6-6" /></svg>;
	}
	if (name === "folder-open") {
		return <svg {...commonProps}><path d="M3.5 7.5h6l2 2h9v8a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" /><path d="M2.5 17.5 5 11h15.5" /></svg>;
	}
	if (name === "folder") {
		return <svg {...commonProps}><path d="M3.5 7.5h6l2 2h9v8a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" /></svg>;
	}
	if (name === "square") {
		return <svg {...commonProps}><rect x="5" y="5" width="14" height="14" rx="1.5" /></svg>;
	}
	if (name === "file") {
		return <svg {...commonProps}><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4" /></svg>;
	}
	if (name === "layout-left") {
		return <svg {...commonProps}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M10 4v16" /></svg>;
	}
	if (name === "plus") {
		return <svg {...commonProps}><path d="M12 5v14M5 12h14" /></svg>;
	}
	return <svg {...commonProps}><circle cx="12" cy="12" r="8" /><path d="M9.5 12h5M12 9.5v5" /></svg>;
}

function SidebarSectionTitle({ children, theme }: { children: React.ReactNode; theme: StudioTheme }): React.JSX.Element {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 7, margin: "13px 9px 7px", color: theme.sidebarText, fontSize: 13, fontWeight: 650 }}>
			<SidebarIcon name="arrow-down" color={theme.sidebarText} size={13} />
			{children}
		</div>
	);
}

function SidebarRow({ children, theme, selected = false, icon }: { children: React.ReactNode; theme: StudioTheme; selected?: boolean; icon: SidebarIconName }): React.JSX.Element {
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
			<span style={{ display: "grid", placeItems: "center", width: 15, color: selected ? theme.activeText : theme.sidebarText, flexShrink: 0 }}><SidebarIcon name={icon} color={selected ? theme.activeText : theme.sidebarText} /></span>
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
					<div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8, width: "100%", margin: "0 0 9px", padding: "4px 9px", color: theme.sidebarText, fontSize: 15, fontWeight: 650, textAlign: "left" }}><SidebarIcon name="plus" color={theme.sidebarText} size={17} />{copy.newSession}</div>
					<SidebarSectionTitle theme={theme}>{copy.pinned}</SidebarSectionTitle>
					<div style={{ padding: "7px 24px", color: theme.sidebarMuted, fontSize: 12 }}>{copy.noPinned}</div>
					<SidebarSectionTitle theme={theme}>{copy.projects}</SidebarSectionTitle>
					{copy.projectNames.map((projectName: string, index: number): React.JSX.Element => (
						<SidebarRow key={projectName} theme={theme} icon={index === 0 ? "folder-open" : index === 1 ? "square" : "folder"}>{projectName}</SidebarRow>
					))}
					<SidebarSectionTitle theme={theme}>{copy.recent}</SidebarSectionTitle>
					<SidebarRow theme={theme} selected={activeItem === "recent"} icon="file">{copy.recentSession}</SidebarRow>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8, width: "100%", marginTop: "auto", padding: "24px 9px 2px", color: theme.sidebarText, fontSize: 13, textAlign: "left" }}><SidebarIcon name="settings" color={theme.sidebarText} size={15} />{copy.settings}</div>
				</aside>

				<main style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0, margin: "0 8px 8px 0", overflow: "hidden", flexDirection: "column", border: `1px solid ${theme.line}`, borderRadius: 11, backgroundColor: theme.surface }}>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44, padding: "0 11px", flexShrink: 0, borderBottom: `1px solid ${theme.line}`, color: theme.surfaceText }}>
						<div style={{ maxWidth: "calc(100% - 30px)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 520 }}>{title}</div>
						<SidebarIcon name="layout-left" color={theme.muted} size={18} />
					</div>
					<div style={{ position: "relative", display: "flex", flex: 1, minHeight: 0, flexDirection: "column" }}>{children}</div>
				</main>
			</div>
		</div>
	);
}
