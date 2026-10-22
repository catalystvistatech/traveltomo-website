// When is a quest playable?
//
// date_range_start / date_range_end are calendar DATES chosen by Philippine
// businesses, so "today" must be the Asia/Manila date — not UTC, which ran
// quests ~8 hours past their last day. Every /v1 route that lists, starts,
// continues or submits quest progress goes through these helpers, so an
// ended quest is refused immediately instead of waiting for the hourly
// expire_quests() cron.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

/** The 410 response every route returns for a quest that can't be played. */
export function questNotPlayableResponse(state: Exclude<QuestState, "playable">) {
  return NextResponse.json(
    {
      error: state === "ended" ? "quest_expired" : "quest_unavailable",
      detail:
        state === "ended"
          ? "This quest has ended and can no longer be played."
          : state === "not_started"
            ? "This quest hasn't started yet."
            : "This quest isn't available right now.",
    },
    { status: 410 }
  );
}

/**
 * Looks the quest up with the admin client (so RLS can't hide an
 * already-expired quest and make the guard fall through) and returns a 410
 * response if it can't be played, or null if it can.
 */
export async function guardQuestPlayable(travelChallengeId: string): Promise<NextResponse | null> {
  const { data } = await createAdminClient()
    .from("travel_challenges")
    .select("status, date_range_start, date_range_end")
    .eq("id", travelChallengeId)
    .maybeSingle();
  if (!data) return questNotPlayableResponse("unavailable");
  const state = questState(data as QuestWindow);
  return state === "playable" ? null : questNotPlayableResponse(state);
}
