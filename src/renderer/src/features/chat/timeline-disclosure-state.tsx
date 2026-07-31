import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

const MAX_DISCLOSURE_ENTRIES: number = 512;

type TimelineDisclosureStore = {
	get: (key: string) => boolean | undefined;
	set: (key: string, open: boolean) => void;
};

const TimelineDisclosureContext = createContext<TimelineDisclosureStore | null>(null);

export type TimelineDisclosureProviderProps = {
	children: ReactNode;
};

export function TimelineDisclosureProvider({ children }: TimelineDisclosureProviderProps): React.JSX.Element {
	const store: TimelineDisclosureStore = useMemo((): TimelineDisclosureStore => {
		const entries: Map<string, boolean> = new Map();
		return {
			get: (key: string): boolean | undefined => entries.get(key),
			set: (key: string, open: boolean): void => {
				entries.delete(key);
				entries.set(key, open);
				while (entries.size > MAX_DISCLOSURE_ENTRIES) {
					const oldestKey: string | undefined = entries.keys().next().value;
					if (oldestKey === undefined) {
						break;
					}
					entries.delete(oldestKey);
				}
			}
		};
	}, []);

	return <TimelineDisclosureContext.Provider value={store}>{children}</TimelineDisclosureContext.Provider>;
}

export function useTimelineDisclosure(key: string, defaultOpen: boolean): readonly [boolean, (open: boolean) => void] {
	const store: TimelineDisclosureStore | null = useContext(TimelineDisclosureContext);
	const [open, setOpenState] = useState<boolean>(() => store?.get(key) ?? defaultOpen);
	const setOpen = useCallback((nextOpen: boolean): void => {
		store?.set(key, nextOpen);
		setOpenState(nextOpen);
	}, [key, store]);

	return [open, setOpen] as const;
}
