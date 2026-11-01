import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseStampCode } from "@/lib/stamps";

/**
 * GET /v1/stamps/card?code=TT-ST-…
 *
 * What the app needs right after scanning a shop's QR, before stamping:
 * the card, how stamps are given (staff code vs. self-scan), how many the
 * staff may give, and the traveler's progress (first visit = welcome bonus).
 * Never returns the QR secret or the staff code.
 */
export async function GET(request: Request) {
  const { user, error: authError } = await requireUser(request);
  if (authError || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const code = parseStampCode(new URL(request.url).searchParams.get("code") ?? "");
  if (!code) {
    return NextResponse.json(
      { error: "not_found", message: "This QR isn't a TravelTomo stamp card." },
      { status: 404 }
    );
  }

  const admin = createAdminClient();
  const { data: card } = await admin
    .from("stamp_cards")
    .select(
      "id, title, stamps_required, reward_title, reward_description, stamp_method, max_stamps_per_visit, welcome_bonus, reward_valid_days, status, ends_at, business:businesses ( id, name, logo_url, address )"
    )
    .eq("qr_code_value", code)
    .maybeSingle();
  if (!card) {
    return NextResponse.json(
      { error: "not_found", message: "This QR isn't a TravelTomo stamp card." },
      { status: 404 }
    );
  }

  const { data: mine } = await admin
    .from("stamp_card_stamps")
    .select("reward_id")
    .eq("card_id", card.id)
    .eq("user_id", user.id)
    .limit(1000);
  const stamps = (mine ?? []).filter((s) => s.reward_id == null).length;
  const ended =
    card.status !== "active" || (card.ends_at != null && new Date(card.ends_at).getTime() <= Date.now());

  return NextResponse.json({
    data: {
      id: card.id,
      title: card.title,
      business: card.business,
      stamps_required: card.stamps_required,
      reward_title: card.reward_title,
      reward_description: card.reward_description,
      stamp_method: card.stamp_method,
      max_stamps_per_visit: card.max_stamps_per_visit,
      welcome_bonus: (mine ?? []).length === 0 ? card.welcome_bonus : 0,
      reward_valid_days: card.reward_valid_days,
      stamps,
      ended,
    },
  });
}
