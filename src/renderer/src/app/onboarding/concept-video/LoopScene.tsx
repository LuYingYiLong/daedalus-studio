import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import type { ConceptVideoCopy } from "./copy";
import { Composer } from "./ContextScene";
import { STUDIO_THEMES, StudioShell } from "./StudioShell";

type LoopSceneProps = {
	copy: ConceptVideoCopy;
	theme: "light" | "dark";
};

export function LoopScene({ copy, theme: themeName }: LoopSceneProps): React.JSX.Element {
	const frame: number = useCurrentFrame();
	const theme = STUDIO_THEMES[themeName];
	const shellOpacity: number = interpolate(frame, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
	const userOpacity: number = interpolate(frame, [13, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
	const assistantOpacity: number = interpolate(frame, [27, 43], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
	const composerOpacity: number = interpolate(frame, [82, 102], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });

	return (
		<AbsoluteFill style={{ backgroundColor: theme.window }}>
			<Interactive.Div
				name={`${themeName} conversation`}
				style={{
					position: "absolute",
					inset: 0,
					opacity: shellOpacity,
					scale: interpolate(frame, [0, 18], [0.985, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1), output: "perceptual-scale" }),
					translate: interpolate(frame, [0, 18], ["0px 8px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) })
				}}
			>
				<StudioShell copy={copy} theme={themeName} title={copy.conversationTitle} activeItem="recent">
					<div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", backgroundColor: theme.surface }}>
						<div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column", overflow: "hidden", padding: "12px 52px 0" }}>
							<Interactive.Div name="User message" style={{ alignSelf: "flex-end", maxWidth: 430, padding: "9px 13px", borderRadius: "12px 12px 4px 12px", backgroundColor: themeName === "light" ? "#4b93c4" : "#3e7ca8", color: "#ffffff", fontSize: 13, lineHeight: 1.38, opacity: userOpacity, translate: `0px ${interpolate(userOpacity, [0, 1], [8, 0])}px` }}>
								{copy.userMessage}
							</Interactive.Div>

							<Interactive.Div name="Assistant response" style={{ marginTop: 19, opacity: assistantOpacity, translate: `0px ${interpolate(assistantOpacity, [0, 1], [8, 0])}px` }}>
								<div style={{ display: "flex", alignItems: "center", gap: 8, color: theme.muted, fontSize: 12 }}>
									<span>{copy.responseTime}</span>
								</div>
								<div style={{ height: 1, margin: "9px 0 12px", backgroundColor: theme.line }} />
								<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: theme.muted, fontSize: 13 }}>
									<span style={{ fontSize: 17 }}>•</span>
									<span>{copy.thinking}</span>
								</div>
								{copy.assistantLines.map((line: string, index: number): React.JSX.Element => {
									const lineOpacity: number = interpolate(frame, [39 + index * 8, 49 + index * 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
									return (
										<div key={line} style={{ display: "flex", gap: 10, maxWidth: 720, marginBottom: 9, color: theme.surfaceText, fontSize: 13, lineHeight: 1.42, opacity: lineOpacity }}>
											<span style={{ color: theme.muted }}>—</span>
											<span>{line}</span>
										</div>
									);
								})}
								<div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, color: theme.muted, fontSize: 12 }}>
									<span style={{ fontSize: 16 }}>›</span>
									<span>{copy.toolSummary}</span>
									<span>·</span>
									<span>{copy.toolCount}</span>
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
