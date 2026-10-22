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

export {
  QUEST_TIME_ZONE,
  manilaToday,
  questState,
  isQuestPlayable,
  type QuestWindow,
  type QuestState,
} from "@/lib/quest-window";
import { questState, type QuestState, type QuestWindow } from "@/lib/quest-window";

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
