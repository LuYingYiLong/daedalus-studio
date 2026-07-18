import ColorBends from "./ColorBends";
import RotatingText from "./RotatingText";
import styles from "./BootSplash.module.css";
import { Icon } from "@/assets/icons";
import { theme } from "antd";
import { motion } from "motion/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

const rotatingTexts: string[] = ["Indexing workspace", "Starting Godot", "Connecting", "Preparing the toolchain"];
const rotatingTextIntervalMs: number = 3600;
const rotatingTextStaggerSeconds: number = 0.02;
const rotatingTextExitSettlingMs: number = 460;

function BootSplash(): React.JSX.Element {
	const { token } = theme.useToken();
	const [rotatingIndex, setRotatingIndex] = useState<number>(0);
	const [pillWidth, setPillWidth] = useState<number | "auto">("auto");
	const measureRefs = useRef<Array<HTMLSpanElement | null>>([]);
	const shrinkTimerRef = useRef<number | null>(null);
	const accentColors: string[] = [token.colorPrimaryActive, token.colorPrimary, token.colorPrimaryHover];
	const splashTokenStyle = {
		"--splash-border-radius": `${token.borderRadius}px`
	} as React.CSSProperties;

	const getMeasuredWidth = useCallback((index: number): number => {
		const element = measureRefs.current[index];

		if (!element) {
			return 0;
		}

		return Math.ceil(element.getBoundingClientRect().width);
	}, []);

	useLayoutEffect(() => {
		const initialWidth = getMeasuredWidth(0);

		if (initialWidth === 0) {
			return;
		}

		setPillWidth(initialWidth);
	}, [getMeasuredWidth]);

	const handleRotatingNext = useCallback(
		(nextIndex: number) => {
			if (shrinkTimerRef.current !== null) {
				window.clearTimeout(shrinkTimerRef.current);
				shrinkTimerRef.current = null;
			}

			const currentWidth = typeof pillWidth === "number" ? pillWidth : getMeasuredWidth(rotatingIndex);
			const nextWidth = getMeasuredWidth(nextIndex);

			setRotatingIndex(nextIndex);

			if (nextWidth >= currentWidth) {
				setPillWidth(nextWidth);
				return;
			}

			const oldTextLength = rotatingTexts[rotatingIndex]?.length ?? 0;
			const shrinkDelay = oldTextLength * rotatingTextStaggerSeconds * 1000 + rotatingTextExitSettlingMs;

			shrinkTimerRef.current = window.setTimeout(() => {
				setPillWidth(nextWidth);
				shrinkTimerRef.current = null;
			}, shrinkDelay);
		},
		[getMeasuredWidth, pillWidth, rotatingIndex]
	);

	return (
		<main className={styles.splash}>
			<ColorBends colors={accentColors} className={styles.bends} />
			<div className={styles.logoLayer}>
				<div className={styles.splashContent}>
					<Icon name="icon_large" className={styles.splashIcon} />
					<div className={styles.splashTitleBar}>
						<span className={styles.splashLead}>Currently</span>
						<motion.span
							className={styles.rotatingPill}
							style={splashTokenStyle}
							animate={{ width: pillWidth }}
							transition={{
								type: "spring",
								damping: 22,
								stiffness: 260
							}}
						>
							<span className={styles.rotatingPillMeasureList} aria-hidden="true">
								{rotatingTexts.map((text, index) => (
									<span
										key={text}
										ref={(element) => {
											measureRefs.current[index] = element;
										}}
										className={styles.rotatingPillMeasure}
									>
										{text}
									</span>
								))}
							</span>
							<RotatingText
								texts={rotatingTexts}
								mainClassName={styles.rotatingText}
								rotationInterval={rotatingTextIntervalMs}
								staggerDuration={rotatingTextStaggerSeconds}
								staggerFrom="first"
								onNext={handleRotatingNext}
							/>
						</motion.span>
					</div>
				</div>
			</div>
		</main>
	);
}

export default BootSplash;
