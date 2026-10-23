import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitNotification } from "@/lib/notifications/emit";
import { parseStampCode, stampErrorMessage } from "@/lib/stamps";

/**
 * POST /v1/stamps/scan
 * Body: { code: string, latitude?: number, longitude?: number }
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
    reward?: { id: string; claim_code: string; reward_title: string } | null;
  };

  if (!r.ok) {
    const status = r.error === "not_found" ? 404 : r.error === "cooldown" ? 429 : 409;
    return NextResponse.json(
      {
        error: r.error,
        message: stampErrorMessage(r.error ?? "failed", r),
        retry_at: r.retry_at ?? null,
        distance_m: r.distance_m ?? null,
      },
      { status }
    );
  }

  const { data: card } = await admin
    .from("stamp_cards")
    .select("id, title, reward_title, stamps_required, business:businesses ( id, name, logo_url )")
    .eq("qr_code_value", code)
    .maybeSingle();

  if (r.reward) {
    await emitNotification({
      userId: user.id,
      kind: "reward_ready",
      title: "Stamp card complete!",
      body: `You earned ${r.reward.reward_title}. Show your code at the counter to claim it.`,
      icon: "gift.fill",
      metadata: { stamp_reward_id: r.reward.id, stamp_card_id: card?.id ?? null },
    });
  }

  return NextResponse.json({
    data: {
      stamps: r.stamps ?? 0,
      required: r.required ?? card?.stamps_required ?? 0,
      reward: r.reward ?? null,
      card,
    },
  });
}
