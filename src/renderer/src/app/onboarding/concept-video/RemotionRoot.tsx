import { Composition, registerRoot } from "remotion";
import {
	DAEDALUS_CONCEPT_VIDEO_DURATION_IN_FRAMES,
	DAEDALUS_CONCEPT_VIDEO_FPS,
	DAEDALUS_CONCEPT_VIDEO_HEIGHT,
	DAEDALUS_CONCEPT_VIDEO_WIDTH,
	DaedalusConceptVideo
} from "./DaedalusConceptVideo";

export function RemotionRoot(): React.JSX.Element {
	return (
		<Composition
			id="DaedalusConceptVideo"
			component={DaedalusConceptVideo}
			durationInFrames={DAEDALUS_CONCEPT_VIDEO_DURATION_IN_FRAMES}
			fps={DAEDALUS_CONCEPT_VIDEO_FPS}
			width={DAEDALUS_CONCEPT_VIDEO_WIDTH}
			height={DAEDALUS_CONCEPT_VIDEO_HEIGHT}
			defaultProps={{ language: "en-US" }}
		/>
	);
}

registerRoot(RemotionRoot);
