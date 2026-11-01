import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitNotification } from "@/lib/notifications/emit";
import { parseStampCode, stampErrorMessage } from "@/lib/stamps";

/**
 * POST /v1/stamps/scan
 * Body: { code: string, latitude?: number, longitude?: number, pin?: string, count?: number }
 *
 * Traveler scanned a business's stamp-card QR. `code` may be the bare
 * TT-ST-… value or the full URL the QR encodes. Every rule (card active and
 * in date, traveler at the business, once per visit, freebie when full) is
 * enforced atomically by public.collect_stamp.
 *
 * 200 { data: { stamps, required, reward | null, card } }
 * 4xx { error: <code>, message: <traveler-facing text>, retry_at?, distance_m? }
 */
export async function POST(request: Request) {
  const { user, error: authError } = await requireUser(request);
  if (authError || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    latitude?: number;
    longitude?: number;
    /** 4-digit staff stamp code (cards using staff confirmation). */
    pin?: string;
    /** Stamps the staff chose to give this visit (1..max_stamps_per_visit). */
    count?: number;
  };
  const code = parseStampCode(body.code ?? "");
  if (!code) {
    return NextResponse.json(
      { error: "not_found", message: stampErrorMessage("not_found") },
      { status: 404 }
    );
  }
  const lat = typeof body.latitude === "number" && Number.isFinite(body.latitude) ? body.latitude : null;
  const lng = typeof body.longitude === "number" && Number.isFinite(body.longitude) ? body.longitude : null;

  const admin = createAdminClient();
  const { data: result, error } = await admin.rpc("collect_stamp", {
    p_qr_code: code,
    p_user_id: user.id,
    p_latitude: lat,
    p_longitude: lng,
    p_pin: typeof body.pin === "string" ? body.pin.trim() : null,
    p_count: Number.isInteger(body.count) ? body.count : 1,
  });
  if (error) {
    console.error("collect_stamp failed", error.message);
    return NextResponse.json({ error: "failed", message: stampErrorMessage("failed") }, { status: 500 });
  }

  const r = result as {
    ok: boolean;
    error?: string;
    stamps?: number;
    required?: number;
    retry_at?: string;
    distance_m?: number;
    attempts_left?: number;
    max_stamps_per_visit?: number;
    added?: number;
    bonus?: number;
    rewards?: { id: string; claim_code: string; reward_title: string; expires_at: string | null }[];
  };

  if (!r.ok) {
    const status =
      r.error === "not_found" ? 404 : r.error === "cooldown" || r.error === "pin_locked" ? 429 : r.error === "pin_required" ? 428 : r.error === "wrong_pin" ? 403 : 409;
    return NextResponse.json(
      {
        error: r.error,
        message: stampErrorMessage(r.error ?? "failed", r),
        retry_at: r.retry_at ?? null,
        distance_m: r.distance_m ?? null,
        attempts_left: r.attempts_left ?? null,
        max_stamps_per_visit: r.max_stamps_per_visit ?? null,
      },
      { status }
    );
  }

  const { data: card } = await admin
    .from("stamp_cards")
    .select("id, title, reward_title, stamps_required, business:businesses ( id, name, logo_url )")
    .eq("qr_code_value", code)
    .maybeSingle();

  const rewards = r.rewards ?? [];
  if (rewards.length > 0) {
    await emitNotification({
      userId: user.id,
      kind: "reward_ready",
      title: "Stamp card complete!",
      body: `You earned ${rewards[0].reward_title}. Show your code at the counter to claim it.`,
      icon: "gift.fill",
      metadata: { stamp_reward_id: rewards[0].id, stamp_card_id: card?.id ?? null },
    });
  }

  return NextResponse.json({
    data: {
      stamps: r.stamps ?? 0,
      required: r.required ?? card?.stamps_required ?? 0,
      added: r.added ?? 1,
      bonus: r.bonus ?? 0,
      rewards,
      // Older app builds read a single `reward`.
      reward: rewards[0] ?? null,
      card,
    },
  });
}
