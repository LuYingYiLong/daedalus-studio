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

type ComposerIconName = "plus" | "sparkles" | "shield" | "brain" | "send";

function ComposerIcon({ name, color }: { name: ComposerIconName; color: string }): React.JSX.Element {
	const commonProps = {
		width: 17,
		height: 17,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: color,
		strokeWidth: 1.8,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		"aria-hidden": true
	};

	if (name === "plus") {
		return <svg {...commonProps}><path d="M12 5v14M5 12h14" /></svg>;
	}
	if (name === "sparkles") {
		return <svg {...commonProps}><path d="m12 3 1.6 6.4L20 11l-6.4 1.6L12 19l-1.6-6.4L4 11l6.4-1.6L12 3Z" /><path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" /></svg>;
	}
	if (name === "shield") {
		return <svg {...commonProps}><path d="M12 3 19 6v5c0 4.3-2.8 8.1-7 10-4.2-1.9-7-5.7-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
	}
	if (name === "brain") {
		return <svg {...commonProps}><path d="M9 5.5A3.5 3.5 0 0 0 5.7 8 3.5 3.5 0 0 0 6 14.5 3.5 3.5 0 0 0 9 19" /><path d="M15 5.5A3.5 3.5 0 0 1 18.3 8a3.5 3.5 0 0 1-.3 6.5A3.5 3.5 0 0 1 15 19" /><path d="M9 5.5v13.8M15 5.5v13.8M9 9h2M13 12h2M9 15h2" /></svg>;
	}
	return <svg {...commonProps}><path d="m4 5 16 7-16 7 2.1-5.4L14 12 6.1 10.4 4 5Z" /></svg>;
}

function ComposerDivider({ color }: { color: string }): React.JSX.Element {
	return <span style={{ width: 1, height: 18, margin: "0 4px", backgroundColor: color }} />;
}

export function Composer({ copy, theme: themeName, progress }: ComposerProps): React.JSX.Element {
	const theme = STUDIO_THEMES[themeName];

	return (
		<div style={{ opacity: progress, translate: `0px ${interpolate(progress, [0, 1], [14, 0])}px` }}>
			<div style={{ margin: "0 52px", overflow: "hidden", border: `1px solid ${theme.composerLine}`, borderRadius: 10, backgroundColor: theme.composer, boxShadow: themeName === "light" ? "0 8px 20px rgba(0, 0, 0, 0.08)" : "0 8px 20px rgba(0, 0, 0, 0.18)" }}>
				<div style={{ height: 67, padding: "13px 10px", color: theme.muted, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{copy.composerPlaceholder}</div>
				<div style={{ display: "flex", alignItems: "center", gap: 7, height: 43, padding: "0 12px", color: theme.surfaceText, fontSize: 13 }}>
					<ComposerIcon name="plus" color={theme.surfaceText} />
					<ComposerDivider color={theme.line} />
					<ComposerIcon name="sparkles" color={theme.surfaceText} />
					<ComposerDivider color={theme.line} />
					<ComposerIcon name="shield" color={theme.surfaceText} />
					<span>{themeName === "dark" ? "Auto safe" : "自动安全"}</span>
					<ComposerDivider color={theme.line} />
					<span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{copy.model}</span>
					<ComposerDivider color={theme.line} />
					<ComposerIcon name="brain" color={theme.surfaceText} />
					<span>{copy.reasoning}</span>
					<span style={{ display: "grid", placeItems: "center", width: 22, height: 22, marginLeft: "auto", color: theme.muted }}><ComposerIcon name="send" color={theme.muted} /></span>
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
				}}>
				<StudioShell copy={copy} theme={themeName} title={copy.newSession} activeItem="home">
					<div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", backgroundColor: theme.surface }}>
						<div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px 32px", textAlign: "center" }}>
							<Interactive.Div
                                name="Welcome title"
                                style={{ opacity: titleOpacity, translate: `0px ${interpolate(titleOpacity, [0, 1], [10, 0])}px` }}>
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
