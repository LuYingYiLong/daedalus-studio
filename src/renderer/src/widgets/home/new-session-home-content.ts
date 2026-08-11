export type NewSessionGreetingPeriod = "morning" | "afternoon" | "evening";

export type NewSessionStarterId = "explore" | "next_step" | "plan";

const MORNING_END_HOUR: number = 12;
const AFTERNOON_END_HOUR: number = 18;

export const WORKSPACE_STARTER_IDS: readonly NewSessionStarterId[] = ["explore", "next_step", "plan"];

export const UNBOUND_STARTER_IDS: readonly NewSessionStarterId[] = ["explore", "plan", "next_step"];

export function getNewSessionGreetingPeriod(hour: number): NewSessionGreetingPeriod {
	if (hour < MORNING_END_HOUR) {
		return "morning";
	}

	if (hour < AFTERNOON_END_HOUR) {
		return "afternoon";
	}

	return "evening";
}
