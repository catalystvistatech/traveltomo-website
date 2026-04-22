"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { revalidatePath } from "next/cache";

export async function listPendingCompletions() {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();

  const canViewAll = user.role === "admin" || user.role === "superadmin";
  const query = supabase
    .from("challenge_completions")
    .select(
      "id, user_id, challenge_id, verification_status, verification_code, completed_at, gps_latitude, gps_longitude, proof_url, challenges!inner(id, title, merchant_id, rewards(id, title, discount_type, discount_value))"
    )
    .order("completed_at", { ascending: false });

  if (!canViewAll) {
    query.eq("challenges.merchant_id", user.id);
  }

  const { data } = await query;
  return data ?? [];
}

export async function verifyCompletion(completionId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("challenge_completions")
    .update({
      verification_status: "verified",
      verified_at: new Date().toISOString(),
      verified_by: user.id,
      reward_released: true,
    })
    .eq("id", completionId);
  if (error) return { error: error.message };
  revalidatePath("/admin/completions");
  return { success: true };
}

export async function rejectCompletion(
  completionId: string,
  reason: string
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("challenge_completions")
    .update({
      verification_status: "rejected",
      verified_at: new Date().toISOString(),
      verified_by: user.id,
      rejection_reason: reason,
    })
    .eq("id", completionId);
  if (error) return { error: error.message };
  revalidatePath("/admin/completions");
  return { success: true };
}
