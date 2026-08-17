import { AbsoluteFill, staticFile, CanvasImage } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { ContextScene } from "./ContextScene";
import { LoopScene } from "./LoopScene";
import { getConceptVideoCopy, type ConceptVideoLanguage } from "./copy";

export const DAEDALUS_CONCEPT_VIDEO_FPS: number = 30;
export const DAEDALUS_CONCEPT_VIDEO_WIDTH: number = 1080;
export const DAEDALUS_CONCEPT_VIDEO_HEIGHT: number = 608;
export const DAEDALUS_CONCEPT_VIDEO_DURATION_IN_FRAMES: number = 398;

export type DaedalusConceptVideoProps = {
	language: ConceptVideoLanguage;
};

export function DaedalusConceptVideo({ language }: DaedalusConceptVideoProps): React.JSX.Element {
	const copy = getConceptVideoCopy(language);

	return (
        <AbsoluteFill>
            <TransitionSeries>
				<TransitionSeries.Sequence durationInFrames={110} name="Light home">
					<ContextScene copy={copy} theme="light" />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition
					timing={linearTiming({ durationInFrames: 14 })}
					presentation={fade()}
				/>
				<TransitionSeries.Sequence durationInFrames={110} name="Dark home">
					<ContextScene copy={copy} theme="dark" />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition
					timing={linearTiming({ durationInFrames: 14 })}
					presentation={fade()}
				/>
				<TransitionSeries.Sequence durationInFrames={110} name="Light conversation">
					<LoopScene copy={copy} theme="light" />
				</TransitionSeries.Sequence>
				<TransitionSeries.Transition
					timing={linearTiming({ durationInFrames: 14 })}
					presentation={fade()}
				/>
				<TransitionSeries.Sequence durationInFrames={110} name="Dark conversation">
					<LoopScene copy={copy} theme="dark" />
				</TransitionSeries.Sequence>
			</TransitionSeries>
        </AbsoluteFill>
    );
}
