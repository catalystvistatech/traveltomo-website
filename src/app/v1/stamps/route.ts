import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /v1/stamps
 *
 * The signed-in traveler's stamp cards (every card they've stamped at
 * least once) with current progress, plus their freebies — unredeemed
 * first. Cards that have since ended are still listed (with `ended: true`)
 * so earned progress doesn't silently vanish, but can't be stamped.
 */
export async function GET(request: Request) {
  const { user, error: authError } = await requireUser(request);
  if (authError || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const admin = createAdminClient();

  const [{ data: stamps, error: stampsError }, { data: rewards, error: rewardsError }] =
    await Promise.all([
      admin
        .from("stamp_card_stamps")
        .select("card_id, stamped_at, reward_id")
        .eq("user_id", user.id)
        .order("stamped_at", { ascending: false })
        .limit(2000),
      admin
        .from("stamp_card_rewards")
        .select("id, card_id, claim_code, reward_title, earned_at, redeemed_at")
        .eq("user_id", user.id)
        .order("earned_at", { ascending: false })
        .limit(200),
    ]);
  if (stampsError || rewardsError) {
    // Log the real cause; never send database errors to the app.
    console.error("GET /v1/stamps failed", (stampsError ?? rewardsError)?.message);
    return NextResponse.json(
      { error: "failed", message: "Stamps aren't available right now. Please try again in a moment." },
      { status: 500 }
    );
  }

  const cardIds = Array.from(
    new Set([...(stamps ?? []).map((s) => s.card_id), ...(rewards ?? []).map((r) => r.card_id)])
  );
  const { data: cards } = cardIds.length
    ? await admin
        .from("stamp_cards")
        .select(
          "id, title, stamps_required, reward_title, reward_description, cooldown_hours, status, ends_at, business:businesses ( id, name, logo_url, address )"
        )
        .in("id", cardIds)
    : { data: [] as never[] };

  const now = Date.now();
  const cardList = (cards ?? []).map((card) => {
    const mine = (stamps ?? []).filter((s) => s.card_id === card.id);
    const open = mine.filter((s) => s.reward_id == null).length;
    const last = mine[0]?.stamped_at ?? null;
    const nextAt =
      last && card.cooldown_hours > 0
        ? new Date(new Date(last).getTime() + card.cooldown_hours * 3_600_000).toISOString()
        : null;
    const ended =
      card.status !== "active" || (card.ends_at != null && new Date(card.ends_at).getTime() <= now);
    return {
      id: card.id,
      title: card.title,
      business: card.business,
      stamps: open,
      stamps_required: card.stamps_required,
      reward_title: card.reward_title,
      reward_description: card.reward_description,
      last_stamped_at: last,
      next_stamp_at: nextAt && new Date(nextAt).getTime() > now ? nextAt : null,
      ends_at: card.ends_at,
      ended,
    };
  });
  // Most recently used first.
  cardList.sort((a, b) => (b.last_stamped_at ?? "").localeCompare(a.last_stamped_at ?? ""));

  const titleById = new Map(cardList.map((c) => [c.id, c]));
  const rewardList = (rewards ?? [])
    .map((r) => ({
      ...r,
      card_title: titleById.get(r.card_id)?.title ?? null,
      business: titleById.get(r.card_id)?.business ?? null,
    }))
    .sort((a, b) => Number(!!a.redeemed_at) - Number(!!b.redeemed_at));

  return NextResponse.json({ data: { cards: cardList, rewards: rewardList } });
}
