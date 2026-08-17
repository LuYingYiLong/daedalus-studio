import { Player } from "@remotion/player";
import { useTranslation } from "react-i18next";
import {
	DAEDALUS_CONCEPT_VIDEO_DURATION_IN_FRAMES,
	DAEDALUS_CONCEPT_VIDEO_FPS,
	DAEDALUS_CONCEPT_VIDEO_HEIGHT,
	DAEDALUS_CONCEPT_VIDEO_WIDTH,
	DaedalusConceptVideo,
} from "./DaedalusConceptVideo";
import type { ConceptVideoLanguage } from "./copy";
import styles from "./DaedalusConceptPlyaer.module.css";

type DaedalusConceptPlayerProps = {
	ariaLabel: string;
};

export function DaedalusConceptPlayer({
	ariaLabel,
}: DaedalusConceptPlayerProps): React.JSX.Element {
	const { i18n } = useTranslation();
	const language: ConceptVideoLanguage = i18n.language
		.toLowerCase()
		.startsWith("zh")
		? "zh-CN"
		: "en-US";

	return (
		<div aria-label={ariaLabel} role="region" className={styles.player}>
			<Player
				component={DaedalusConceptVideo}
				inputProps={{ language }}
				durationInFrames={DAEDALUS_CONCEPT_VIDEO_DURATION_IN_FRAMES}
				fps={DAEDALUS_CONCEPT_VIDEO_FPS}
				compositionWidth={DAEDALUS_CONCEPT_VIDEO_WIDTH}
				compositionHeight={DAEDALUS_CONCEPT_VIDEO_HEIGHT}
				autoPlay={true}
				loop={true}
				controls={true}
				clickToPlay={true}
				initiallyMuted={true}
				showVolumeControls={false}
				style={{ width: "100%", display: "block" }}
			/>
		</div>
	);
}
