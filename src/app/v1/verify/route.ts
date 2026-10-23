import { NextResponse } from "next/server";

/**
 * POST /v1/verify — retired.
 *
 * This older verify path skipped the ownership check, never closed out the
 * stop (player_status / completed_at) and never completed the quest, so it
 * disagreed with /v1/redemptions/verify and the dashboard. Nothing calls it
 * (the iOS merchant scanner uses /v1/redemptions/verify); it now answers 410
 * so any stale client fails loudly instead of half-verifying.
 */
export async function POST() {
  return NextResponse.json(
    { error: "gone", detail: "Use POST /v1/redemptions/verify." },
    { status: 410 }
  );
}
