import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { ensureTravelChallengeProgress } from "@/lib/challenge-progress";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/travel-challenges/:id/start
 *
 * Ensures the caller has an active `travel_challenge_progress` row for
 * this set. Idempotent — safe to call when the user taps Start Challenge.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { user, client, error } = await requireUser(request);
  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: tc, error: tcError } = await client
    .from("travel_challenges")
    .select("id, status")
    .eq("id", id)
    .eq("status", "live")
    .maybeSingle();

  if (tcError) {
    return NextResponse.json({ error: tcError.message }, { status: 500 });
  }
  if (!tc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const progress = await ensureTravelChallengeProgress(client, user.id, id);
    return NextResponse.json({ data: progress });
  } catch (e) {
    const message = e instanceof Error ? e.message : "start failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
