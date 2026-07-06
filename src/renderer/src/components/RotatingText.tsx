import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import styles from "./RotatingText.module.css";

type RotatingTextProps = {
	texts: string[];
	rotationInterval?: number;
	className?: string;
	mainClassName?: string;
};

function joinClassNames(...classNames: Array<string | undefined>): string {
	return classNames.filter(Boolean).join(" ");
}

function RotatingText({ texts, rotationInterval = 2000, className, mainClassName }: RotatingTextProps): React.JSX.Element {
	const [currentIndex, setCurrentIndex] = useState<number>(0);
	const currentText: string = texts[currentIndex] ?? "";

	useEffect(() => {
		if (texts.length <= 1) {
			return undefined;
		}

		const intervalId = window.setInterval(() => {
			setCurrentIndex((value) => (value + 1) % texts.length);
		}, rotationInterval);

		return () => window.clearInterval(intervalId);
	}, [rotationInterval, texts.length]);

	return (
		<span className={joinClassNames(styles.rotatingText, mainClassName, className)}>
			<span className={styles.screenReaderText}>{currentText}</span>
			<AnimatePresence mode="wait" initial={false}>
				<motion.span
					key={currentText}
					aria-hidden="true"
					className={styles.rotatingTextValue}
					initial={{ y: "80%", opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					exit={{ y: "-80%", opacity: 0 }}
					transition={{ duration: 0.34, ease: "easeInOut" }}
				>
					{currentText}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

export default RotatingText;
