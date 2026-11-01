"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { libraryRewardSchema } from "@/lib/validations/marketplace";
import { revalidatePath } from "next/cache";

/**
 * Lightweight shape of a reward row returned by the actions in this
 * file. Library rewards (challenge_id = NULL) and per-challenge
 * rewards share the same row shape.
 */
export type RewardRow = {
  id: string;
  merchant_id: string;
  challenge_id: string | null;
  title: string;
  description: string | null;
  discount_type: "percentage" | "fixed" | "freebie";
  discount_value: number | null;
  max_redemptions: number | null;
  current_redemptions: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  challenges?: { title: string | null; status: string | null } | null;
};

/**
 * Returns the rewards the current merchant has visibility into.
 *   - library:    not yet bound to any challenge (reusable pool)
 *   - linked:     bound 1:1 to a specific challenge stop
 */
export async function listMerchantRewards(): Promise<{
  library: RewardRow[];
  linked: RewardRow[];
}> {
  const user = await getCurrentUser();
  if (!user) return { library: [], linked: [] };
  const supabase = await createClient();

  const isAdmin = user.role === "admin" || user.role === "superadmin";
  const query = supabase
    .from("rewards")
    .select("*, challenges(title, status)")
    .order("created_at", { ascending: false });
  if (!isAdmin) query.eq("merchant_id", user.id);

  const { data } = await query;
  const rows = ((data ?? []) as unknown as RewardRow[]) ?? [];
  return {
    library: rows.filter((r) => !r.challenge_id),
    linked: rows.filter((r) => !!r.challenge_id),
  };
}

/**
 * Create a standalone "library" reward owned by the calling merchant.
 * Library rewards are not tied to any challenge yet -- they live in the
 * merchant's reward pool until picked as a travel challenge big
 * reward (or, in the future, attached to a child stop).
 */
export async function createLibraryReward(input: unknown) {
  const parsed = libraryRewardSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const user = await getCurrentUser();
  if (!user) return { error: { _form: ["Not authenticated"] } };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rewards")
    .insert({
      merchant_id: user.id,
      challenge_id: null,
      title: parsed.data.title,
      description: parsed.data.description || null,
      discount_type: parsed.data.discount_type,
      discount_value: parsed.data.discount_value ?? null,
      max_redemptions: parsed.data.max_redemptions ?? null,
      expires_at: parsed.data.expires_at || null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) return { error: { _form: [error.message] } };
  revalidatePath("/admin", "layout");
  return { success: true, id: data.id };
}

/**
 * Delete a library reward the merchant owns. Refuses to delete rewards
 * already attached to a challenge (those must be removed via the
 * challenge edit flow so we don't orphan in-flight redemptions).
 */
export async function deleteLibraryReward(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("rewards")
    .select("id, challenge_id, merchant_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Reward not found" };
  if (row.merchant_id !== user.id && user.role !== "admin" && user.role !== "superadmin") {
    return { error: "You don't own this reward" };
  }
  if (row.challenge_id) {
    return {
      error: "This reward is linked to a challenge. Edit the challenge to remove it first.",
    };
  }

  const { error } = await supabase.from("rewards").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { success: true };
}
