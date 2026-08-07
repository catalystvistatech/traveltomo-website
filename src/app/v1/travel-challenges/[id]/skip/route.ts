import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { consumeGlobalSkip } from "@/lib/challenge-progress";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/travel-challenges/:id/skip
 *
 * Consumes one skip from the player's GLOBAL pool (3 skips, refilled
 * every 3 hours, shared across every quest and challenge — unlimited for
 * subscribers). Quests no longer carry their own separate budget; the
 * response keeps the legacy per-quest shape so older builds still decode:
 *
 *   {
 *     consumed: bool,
 *     requires_ad: bool,   // pool empty — client gates the action on an ad
 *     skips_used: number,  // of the 3-skip window
 *     skips_limit: number  // always 3
 *   }
 */
export async function POST(request: Request, { params }: Params) {
  await params; // id unused: the pool is global, not per-quest
  const { user, client, error } = await requireUser(request);
  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const data = await consumeGlobalSkip(client, user.id);
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "skip failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
