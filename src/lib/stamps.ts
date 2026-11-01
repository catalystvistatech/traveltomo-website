// Stamp cards: shared helpers for the /v1 API and the merchant dashboard.
//
// A card's printed QR encodes a URL, https://www.traveltomo.app/s/TT-ST-XXXX.
// Scanned with the phone camera it opens a "get the app" page; scanned inside
// the app it collects a stamp. All stamping rules live in the SQL function
// public.collect_stamp (supabase/060_stamp_cards.sql).

import type { SupabaseClient } from "@supabase/supabase-js";

export const STAMP_QR_PREFIX = "TT-ST-";
export const STAMP_REWARD_PREFIX = "TT-SC-";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.traveltomo.app";

export function stampQrUrl(qrCodeValue: string) {
  return `${SITE_URL}/s/${encodeURIComponent(qrCodeValue)}`;
}

/** New printable secret for a card. Unguessable; uppercase for readability. */
export function newStampQrValue() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  const body = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${STAMP_QR_PREFIX}${body}`;
}

/** A random 4-digit staff stamp code, e.g. "4821". */
export function newStaffPin() {
  const n = crypto.getRandomValues(new Uint16Array(1))[0] % 10000;
  return n.toString().padStart(4, "0");
}

/**
 * Accepts whatever the scanner read — the bare code or the full URL — and
 * returns the card code, or null if it isn't a stamp QR at all.
 */
export function parseStampCode(raw: string): string | null {
  const text = raw.trim();
  const match = text.match(/TT-ST-[A-Z0-9]+/i);
  return match ? match[0].toUpperCase() : null;
}

export type CollectStampError =
  | "not_found"
  | "inactive"
  | "not_started"
  | "ended"
  | "too_far"
  | "location_required"
  | "cooldown"
  | "pin_required"
  | "wrong_pin"
  | "pin_locked";

/** Traveler-facing explanation for a refused scan. */
export function stampErrorMessage(
  error: CollectStampError | string,
  extra?: { retry_at?: string; distance_m?: number; attempts_left?: number }
): string {
  switch (error) {
    case "not_found":
      return "This QR isn't a TravelTomo stamp card.";
    case "inactive":
      return "This stamp card is paused right now.";
    case "not_started":
      return "This stamp card hasn't started yet.";
    case "ended":
      return "This stamp card has ended.";
    case "too_far":
      return extra?.distance_m
        ? `You need to be at the shop to collect a stamp (you're about ${Math.round(extra.distance_m)} m away).`
        : "You need to be at the shop to collect a stamp.";
    case "location_required":
      return "Turn on location so we can confirm you're at the shop.";
    case "cooldown":
      return "You already got a stamp here recently. Come back on your next visit!";
    case "pin_required":
      return "Ask the staff to enter the stamp code.";
    case "wrong_pin":
      return extra?.attempts_left != null && extra.attempts_left <= 2
        ? `That code isn't right. ${extra.attempts_left} ${extra.attempts_left === 1 ? "try" : "tries"} left before a 15-minute pause.`
        : "That code isn't right. Ask the staff to try again.";
    case "pin_locked":
      return "Too many wrong codes. Please wait 15 minutes, then ask the staff again.";
    default:
      return "Couldn't collect the stamp. Please try again.";
  }
}

export type RedeemResult =
  | { ok: true; rewardTitle: string; cardTitle: string; userId: string; rewardId: string }
  | { ok: false; error: "not_found" | "forbidden" | "already_redeemed" | "expired" | "failed"; message: string };

/**
 * Marks a stamp-card freebie (TT-SC-XXXXXX) as handed over. Only the card's
 * merchant (or staff) may redeem it. `merchantScopeId` is the merchant the
 * actor is acting for; pass null for unrestricted staff.
 */
export async function redeemStampReward(
  admin: SupabaseClient,
  code: string,
  actorId: string,
  merchantScopeId: string | null
): Promise<RedeemResult> {
  const { data: row, error } = await admin
    .from("stamp_card_rewards")
    .select("id, user_id, reward_title, redeemed_at, expires_at, card:stamp_cards!inner ( id, title, merchant_id )")
    .eq("claim_code", code.trim().toUpperCase())
    .maybeSingle();
  if (error) return { ok: false, error: "failed", message: error.message };
  if (!row) return { ok: false, error: "not_found", message: "No freebie found for that code." };

  const card = (row as unknown as { card: { id: string; title: string; merchant_id: string } }).card;
  if (merchantScopeId && card.merchant_id !== merchantScopeId) {
    return { ok: false, error: "forbidden", message: "That freebie belongs to another business." };
  }
  if (row.redeemed_at) {
    return { ok: false, error: "already_redeemed", message: "This freebie was already given out." };
  }
  if (row.expires_at && new Date(row.expires_at as string).getTime() < Date.now()) {
    return { ok: false, error: "expired", message: "This freebie has expired." };
  }

  // Conditional update so two staff scanning the same code can't both win.
  const { data: updated, error: updateError } = await admin
    .from("stamp_card_rewards")
    .update({ redeemed_at: new Date().toISOString(), redeemed_by: actorId })
    .eq("id", row.id)
    .is("redeemed_at", null)
    .select("id");
  if (updateError) return { ok: false, error: "failed", message: updateError.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "already_redeemed", message: "This freebie was already given out." };
  }

  return {
    ok: true,
    rewardTitle: row.reward_title as string,
    cardTitle: card.title,
    userId: row.user_id as string,
    rewardId: row.id as string,
  };
}
