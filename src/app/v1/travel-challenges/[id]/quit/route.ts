import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { loadActiveTravelProgress } from "@/lib/challenge-progress";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/travel-challenges/:id/quit
 *
 * Ends the caller's active session for a quest ("Quit Anyway" on the
 * Home ongoing-quest card). The session flips to `abandoned` — giving up
 * the big reward — and any in-flight stop is forfeited so it returns to
 * the rollable pool if the traveler ever restarts the quest. Claimed
 * stops (and their XP) are untouched.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { user, client, error } = await requireUser(request);
  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const progress = await loadActiveTravelProgress(client, user.id, id);
  if (!progress) {
    return NextResponse.json({ error: "no_active_quest" }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Forfeit the in-flight stop first so its partial-unique slot frees up.
  const { error: stopError } = await client
    .from("challenge_completions")
    .update({ player_status: "forfeited", completed_at: now })
    .eq("user_id", user.id)
    .eq("travel_challenge_progress_id", progress.id)
    .eq("player_status", "ongoing");
  if (stopError) {
    return NextResponse.json({ error: stopError.message }, { status: 500 });
  }

  const { error: updateError } = await client
    .from("travel_challenge_progress")
    .update({ status: "abandoned", updated_at: now })
    .eq("id", progress.id)
    .eq("user_id", user.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ data: { ok: true, progress_id: progress.id } });
}
