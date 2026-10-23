// Pure quest-window rules, safe to import from client components.
// See src/lib/quest-dates.ts for the server-side guards built on these.

export const QUEST_TIME_ZONE = "Asia/Manila";

/** Today's date in the Philippines as YYYY-MM-DD. */
export function manilaToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: QUEST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type QuestWindow = {
  status: string;
  date_range_start: string | null;
  date_range_end: string | null;
};

export type QuestState = "playable" | "not_started" | "ended" | "unavailable";

export function questState(q: QuestWindow, today: string = manilaToday()): QuestState {
  if (q.status === "expired") return "ended";
  if (q.status !== "live") return "unavailable";
  if (q.date_range_end && today > q.date_range_end) return "ended";
  if (q.date_range_start && today < q.date_range_start) return "not_started";
  return "playable";
}

export function isQuestPlayable(q: QuestWindow, today?: string) {
  return questState(q, today) === "playable";
}
