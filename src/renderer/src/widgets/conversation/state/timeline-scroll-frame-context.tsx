import type { PropsWithChildren } from "react";
import { createContext, useContext } from "react";
import type { TimelineScrollFrameCoordinator } from "@/domain/conversation/timeline-scroll-frame";

const TimelineScrollFrameContext = createContext<TimelineScrollFrameCoordinator | null>(null);

export type TimelineScrollFrameProviderProps = PropsWithChildren<{
	coordinator: TimelineScrollFrameCoordinator;
}>;

export function TimelineScrollFrameProvider({ coordinator, children }: TimelineScrollFrameProviderProps): React.JSX.Element {
	return (
		<TimelineScrollFrameContext.Provider value={coordinator}>
			{children}
		</TimelineScrollFrameContext.Provider>
	);
}

export function useTimelineScrollFrameCoordinator(): TimelineScrollFrameCoordinator | null {
	return useContext(TimelineScrollFrameContext);
}
