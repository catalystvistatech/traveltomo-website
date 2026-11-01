"use server";

// Merchant dashboard actions for stamp cards. Tenancy follows the rest of the
// dashboard: everything is scoped to resolveMerchantScope().merchantId (the
// merchant themself, or the merchant a superadmin is acting as).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { resolveMerchantScope, scopeAllowsWrite } from "@/lib/actions/scope";
import { recordActAsChange } from "@/lib/actions/actAs";
import { newStaffPin, newStampQrValue, stampQrUrl } from "@/lib/stamps";

export type StampCardRow = {
  id: string;
  title: string;
  business_id: string;
  business_name: string;
  stamps_required: number;
  reward_title: string;
  stamp_method: "staff_pin" | "self_scan";
  /** 4-digit code staff type on the traveler's phone (staff_pin cards). */
  staff_pin: string | null;
  welcome_bonus: number;
  reward_valid_days: number | null;
  status: "active" | "paused" | "archived";
  ends_at: string | null;
  /** Past its last day (computed server-side). */
  ended: boolean;
  qr_url: string;
  qr_svg: string;
  stats: { collectors: number; stampsThisWeek: number; freebiesEarned: number; freebiesGiven: number };
};

export async function listStampCards(): Promise<StampCardRow[]> {
  const scope = await resolveMerchantScope();
  if (!scope) return [];
  const supabase = await createClient();
  const { data: cards } = await supabase
    .from("stamp_cards")
    .select("id, title, business_id, stamps_required, reward_title, stamp_method, staff_pin, welcome_bonus, reward_valid_days, status, ends_at, qr_code_value, business:businesses ( name )")
    .eq("merchant_id", scope.merchantId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (!cards?.length) return [];

  const ids = cards.map((c) => c.id);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: stamps }, { data: rewards }] = await Promise.all([
    supabase.from("stamp_card_stamps").select("card_id, user_id, stamped_at").in("card_id", ids).limit(10000),
    supabase.from("stamp_card_rewards").select("card_id, redeemed_at").in("card_id", ids).limit(10000),
  ]);

  return Promise.all(
    cards.map(async (c) => {
      const mine = (stamps ?? []).filter((s) => s.card_id === c.id);
      const won = (rewards ?? []).filter((r) => r.card_id === c.id);
      const url = stampQrUrl(c.qr_code_value as string);
      return {
        id: c.id as string,
        title: c.title as string,
        business_id: c.business_id as string,
        business_name: ((c.business as unknown as { name?: string } | null)?.name ?? "") as string,
        stamps_required: c.stamps_required as number,
        reward_title: c.reward_title as string,
        stamp_method: c.stamp_method as StampCardRow["stamp_method"],
        staff_pin: (c.staff_pin as string | null) ?? null,
        welcome_bonus: c.welcome_bonus as number,
        reward_valid_days: (c.reward_valid_days as number | null) ?? null,
        status: c.status as StampCardRow["status"],
        ends_at: (c.ends_at as string | null) ?? null,
        ended: c.ends_at != null && new Date(c.ends_at as string).getTime() <= Date.now(),
        qr_url: url,
        qr_svg: await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
        stats: {
          collectors: new Set(mine.map((s) => s.user_id)).size,
          stampsThisWeek: mine.filter((s) => s.stamped_at >= weekAgo).length,
          freebiesEarned: won.length,
          freebiesGiven: won.filter((r) => r.redeemed_at).length,
        },
      };
    })
  );
}

const createSchema = z.object({
  businessId: z.string().uuid("Pick a business"),
  title: z.string().trim().min(3, "Name needs at least 3 characters").max(80),
  stampsRequired: z.coerce.number().int().min(2, "At least 2 stamps").max(20, "At most 20 stamps"),
  rewardTitle: z.string().trim().min(3, "Freebie needs at least 3 characters").max(100),
  endsAt: z.string().optional().nullable(),
  stampMethod: z.enum(["staff_pin", "self_scan"]).default("staff_pin"),
  welcomeBonus: z.coerce.number().int().min(0).max(3).default(1),
  rewardValidDays: z.coerce.number().int().min(1).max(365).nullable().default(30),
});

export async function createStampCard(input: z.input<typeof createSchema>) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your answers." };
  const scope = await resolveMerchantScope();
  if (!scope) return { error: "Not authenticated" };
  if (!scopeAllowsWrite(scope)) return { error: "Read-only access." };

  const supabase = await createClient();
  const { data: biz } = await supabase
    .from("businesses")
    .select("id, latitude, longitude")
    .eq("id", parsed.data.businessId)
    .eq("merchant_id", scope.merchantId)
    .maybeSingle();
  if (!biz) return { error: "That business doesn't belong to you." };
  if (biz.latitude == null || biz.longitude == null) {
    return { error: "Add your business's location on the Profile page first, so we can check travelers are really there." };
  }

  const endsAt = parsed.data.endsAt ? new Date(`${parsed.data.endsAt}T23:59:59+08:00`).toISOString() : null;
  const { data, error } = await supabase
    .from("stamp_cards")
    .insert({
      merchant_id: scope.merchantId,
      business_id: biz.id,
      title: parsed.data.title,
      stamps_required: parsed.data.stampsRequired,
      reward_title: parsed.data.rewardTitle,
      qr_code_value: newStampQrValue(),
      ends_at: endsAt,
      stamp_method: parsed.data.stampMethod,
      staff_pin: parsed.data.stampMethod === "staff_pin" ? newStaffPin() : null,
      welcome_bonus: parsed.data.welcomeBonus,
      reward_valid_days: parsed.data.rewardValidDays,
      // Staff confirm each stamp themselves; self-scan needs a delay so one
      // traveler can't stamp the whole card in one sitting.
      cooldown_hours: parsed.data.stampMethod === "self_scan" ? 12 : 0,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await recordActAsChange(scope, {
    action: "createStampCard",
    entityType: "stamp_card",
    entityId: data.id,
    after: parsed.data,
  });
  revalidatePath("/admin/stamp-cards");
  return { success: true as const, id: data.id as string };
}

export async function setStampCardStatus(id: string, status: "active" | "paused" | "archived") {
  const scope = await resolveMerchantScope();
  if (!scope) return { error: "Not authenticated" };
  if (!scopeAllowsWrite(scope)) return { error: "Read-only access." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stamp_cards")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("merchant_id", scope.merchantId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Stamp card not found." };
  await recordActAsChange(scope, { action: "setStampCardStatus", entityType: "stamp_card", entityId: id, after: { status } });
  revalidatePath("/admin/stamp-cards");
  return { success: true as const };
}

/** Issue a new 4-digit staff stamp code (e.g. if a customer saw it). */
export async function rotateStampCardPin(id: string) {
  const scope = await resolveMerchantScope();
  if (!scope) return { error: "Not authenticated" };
  if (!scopeAllowsWrite(scope)) return { error: "Read-only access." };
  const supabase = await createClient();
  const pin = newStaffPin();
  const { data, error } = await supabase
    .from("stamp_cards")
    .update({ staff_pin: pin, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("merchant_id", scope.merchantId)
    .eq("stamp_method", "staff_pin")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Stamp card not found." };
  await recordActAsChange(scope, { action: "rotateStampCardPin", entityType: "stamp_card", entityId: id });
  revalidatePath("/admin/stamp-cards");
  return { success: true as const, pin };
}
