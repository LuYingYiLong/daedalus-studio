import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import type { ConceptVideoCopy } from "./copy";
import { STUDIO_THEMES, StudioShell } from "./StudioShell";

type ContextSceneProps = {
	copy: ConceptVideoCopy;
	theme: "light" | "dark";
};

type ComposerProps = {
	copy: ConceptVideoCopy;
	theme: "light" | "dark";
	progress: number;
};

export function Composer({ copy, theme: themeName, progress }: ComposerProps): React.JSX.Element {
	const theme = STUDIO_THEMES[themeName];

	return (
		<div style={{ opacity: progress, translate: `0px ${interpolate(progress, [0, 1], [14, 0])}px` }}>
			<div style={{ margin: "0 52px", overflow: "hidden", border: `1px solid ${theme.composerLine}`, borderRadius: 10, backgroundColor: theme.composer, boxShadow: themeName === "light" ? "0 8px 20px rgba(0, 0, 0, 0.08)" : "0 8px 20px rgba(0, 0, 0, 0.18)" }}>
				<div style={{ height: 56, padding: "11px 10px", color: theme.muted, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{copy.composerPlaceholder}</div>
				<div style={{ display: "flex", alignItems: "center", gap: 8, height: 39, padding: "0 12px", borderTop: `1px solid ${theme.line}`, color: theme.surfaceText, fontSize: 13 }}>
					<span style={{ fontSize: 22, fontWeight: 300, lineHeight: 1 }}>＋</span>
					<span style={{ width: 1, height: 18, backgroundColor: theme.line }} />
					<span style={{ fontSize: 16 }}>✣</span>
					<span style={{ width: 1, height: 18, backgroundColor: theme.line }} />
					<span style={{ fontSize: 14 }}>⬡</span>
					<span>{themeName === "dark" ? "Auto safe" : "自动安全"}</span>
					<span style={{ width: 1, height: 18, marginLeft: 4, backgroundColor: theme.line }} />
					<span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{copy.model}</span>
					<span style={{ fontSize: 16 }}>♧</span>
					<span>{copy.reasoning}</span>
					<span style={{ marginLeft: "auto", color: theme.muted, fontSize: 19 }}>➤</span>
				</div>
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: 7, height: 26, margin: "0 52px", padding: "0 12px", color: theme.muted, fontSize: 12 }}>
				<span style={{ fontSize: 17 }}>×</span>
				{copy.noWorkspace}
			</div>
		</div>
	);
}

export function ContextScene({ copy, theme: themeName }: ContextSceneProps): React.JSX.Element {
	const frame: number = useCurrentFrame();
	const theme = STUDIO_THEMES[themeName];
	const shellOpacity: number = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
	const titleOpacity: number = interpolate(frame, [18, 38], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
	const composerOpacity: number = interpolate(frame, [67, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });

	return (
		<AbsoluteFill style={{ backgroundColor: theme.window }}>
			<Interactive.Div
				name={`${themeName} home`}
				style={{
					position: "absolute",
					inset: 0,
					opacity: shellOpacity,
					scale: interpolate(frame, [0, 20], [0.985, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1), output: "perceptual-scale" }),
					translate: interpolate(frame, [0, 20], ["0px 8px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) })
				}}
			>
				<StudioShell copy={copy} theme={themeName} title={copy.newSession} activeItem="home">
					<div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", backgroundColor: theme.surface }}>
						<div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px 32px", textAlign: "center" }}>
							<Interactive.Div
								name="Welcome title"
								style={{ opacity: titleOpacity, translate: `0px ${interpolate(titleOpacity, [0, 1], [10, 0])}px` }}
							>
								<div style={{ color: theme.surfaceText, fontSize: 30, fontWeight: 700, letterSpacing: -1.1, lineHeight: 1.08 }}>{copy.homeTitleLine1}<br />{copy.homeTitleLine2}</div>
								<div style={{ marginTop: 14, color: theme.muted, fontSize: 14 }}>{copy.homeSubtitle}</div>
								<div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 20 }}>
									{copy.starterLabels.map((label: string, index: number): React.JSX.Element => {
										const chipOpacity: number = interpolate(frame, [43 + index * 5, 56 + index * 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
										return (
											<div key={label} style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 31, padding: "0 12px", border: `1px solid ${theme.controlLine}`, borderRadius: 18, backgroundColor: theme.control, color: theme.surfaceText, fontSize: 13, opacity: chipOpacity, translate: `0px ${interpolate(chipOpacity, [0, 1], [6, 0])}px` }}>
												<span style={{ color: theme.muted, fontSize: 15 }}>{index === 0 ? "⌕" : index === 1 ? "☷" : "✣"}</span>
												{label}
											</div>
										);
									})}
								</div>
							</Interactive.Div>
						</div>
						<Composer copy={copy} theme={themeName} progress={composerOpacity} />
					</div>
				</StudioShell>
			</Interactive.Div>
		</AbsoluteFill>
	);
}
