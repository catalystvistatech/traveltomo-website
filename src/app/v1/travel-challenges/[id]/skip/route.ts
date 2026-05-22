import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { ensureTravelChallengeProgress } from "@/lib/challenge-progress";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/travel-challenges/:id/skip
 *
 * Consumes one of the player's per-quest free skips. Each travel-
 * challenge set gives the user a fixed budget (`skips_limit`, currently
 * 3); after that we return `requires_ad=true` and the client switches
 * to the non-intrusive side-ad surface.
 *
 * Returns:
 *   {
 *     consumed: bool,
 *     requires_ad: bool,
 *     skips_used: number,
 *     skips_limit: number
 *   }
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { user, client, error } = await requireUser(request);
  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const progress = await ensureTravelChallengeProgress(client, user.id, id);
    const { data, error: rpcError } = await client.rpc("consume_quest_skip", {
      p_user: user.id,
      p_progress_id: progress.id,
    });
    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "skip failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
