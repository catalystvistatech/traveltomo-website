import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

/**
 * GET /v1/me/active-quests
 *
 * Returns every travel-challenge (Quest) the caller currently has in
 * progress - i.e. has a travel_challenge_progress row with status
 * 'active' - ordered by most-recent activity first.
 *
 * Why this exists: the public /v1/travel-challenges list is anonymous +
 * CDN-cached so it cannot carry per-user state, and /v1/me/active-challenge
 * only surfaces ONE in-flight stop (a completion with completed_at IS NULL).
 * That broke multi-quest handling: a Quest whose only stop was already
 * submitted (completed_at set, awaiting merchant) showed "Start Quest"
 * because nothing told the client it was already underway, and the Home
 * "Ongoing" banner pointed at whichever quest happened to have an
 * un-submitted stop rather than the one the traveler was actually on.
 *
 * The Home screen uses this to:
 *   - label each Quest card "Continue Quest" vs "Start Quest" per quest, and
 *   - drive the "Ongoing quest" banner from the most-recently-active quest.
 *
 * RLS restricts travel_challenge_progress + challenge_completions to the
 * caller, so we never trust client-provided ids.
 */
export async function GET(request: Request) {
  const { user, client, error } = await requireUser(request);
  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: progressRows, error: progressError } = await client
    .from("travel_challenge_progress")
    .select(
      `id, travel_challenge_id, status, updated_at,
       travel_challenge:travel_challenges!inner (
         id, title, cover_url, status, merchant_id,
         business:businesses!travel_challenges_business_id_fkey ( name, city ),
         children:challenges!travel_challenge_id ( id, status )
       )`
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (progressError) {
    return NextResponse.json({ error: progressError.message }, { status: 500 });
  }

  type ProgressRow = {
    id: string;
    travel_challenge_id: string;
    status: string;
    updated_at: string | null;
    travel_challenge: {
      id: string;
      title: string;
      cover_url: string | null;
      status: string;
      merchant_id: string;
      business: { name: string | null; city: string | null } | null;
      children: { id: string; status: string }[] | null;
    } | null;
  };

  const rows = (progressRows ?? []) as unknown as ProgressRow[];
  // Only surface quests that are still live (a merchant could have
  // paused/archived a quest the traveler had in progress) and never the
  // caller's OWN quests (conflict of interest - migration 035).
  const liveRows = rows.filter(
    (r) =>
      r.travel_challenge?.status === "live" &&
      r.travel_challenge?.merchant_id !== user.id
  );

  if (liveRows.length === 0) {
    return NextResponse.json(
      { data: [] },
      { headers: { "Cache-Control": "private, max-age=10" } }
    );
  }

  // One batched query for the caller's completions across every live
  // child stop of these quests, so we can report how many stops are
  // "done" (proof submitted or merchant-verified) per quest.
  const childToQuest = new Map<string, string>();
  for (const r of liveRows) {
    for (const child of r.travel_challenge?.children ?? []) {
      if (child.status === "live") childToQuest.set(child.id, r.travel_challenge_id);
    }
  }

  const doneByQuest = new Map<string, number>();
  const childIds = Array.from(childToQuest.keys());
  if (childIds.length > 0) {
    const { data: completions } = await client
      .from("challenge_completions")
      .select("challenge_id, player_status, verification_status")
      .eq("user_id", user.id)
      .in("challenge_id", childIds);

    for (const row of completions ?? []) {
      const c = row as {
        challenge_id: string;
        player_status: string | null;
        verification_status: string | null;
      };
      const isDone =
        c.player_status === "submitted" ||
        c.player_status === "claimed" ||
        c.verification_status === "verified";
      if (!isDone) continue;
      const questId = childToQuest.get(c.challenge_id);
      if (!questId) continue;
      doneByQuest.set(questId, (doneByQuest.get(questId) ?? 0) + 1);
    }
  }

  const data = liveRows.map((r) => {
    const tc = r.travel_challenge!;
    const totalStops = (tc.children ?? []).filter((c) => c.status === "live").length;
    return {
      travel_challenge_id: r.travel_challenge_id,
      title: tc.title,
      cover_url: tc.cover_url,
      business_name: tc.business?.name ?? null,
      city: tc.business?.city ?? null,
      status: r.status,
      total_stops: totalStops,
      done_stops: doneByQuest.get(r.travel_challenge_id) ?? 0,
      updated_at: r.updated_at,
    };
  });

  return NextResponse.json(
    { data },
    { headers: { "Cache-Control": "private, max-age=10" } }
  );
}
