"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { emitNotification } from "@/lib/notifications/emit";
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

  const { data: completion, error: fetchError } = await supabase
    .from("challenge_completions")
    .select("id, user_id, challenge_id, challenges!inner(title)")
    .eq("id", completionId)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };

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

  if (completion?.user_id) {
    const challengeTitle =
      (completion as { challenges?: { title?: string } | null }).challenges?.title ??
      "your challenge";
    await emitNotification({
      userId: completion.user_id,
      kind: "challenge_verified",
      title: "Reward unlocked",
      body: `Your completion for “${challengeTitle}” has been verified.`,
      icon: "checkmark.seal.fill",
      metadata: {
        completion_id: completionId,
        challenge_id: completion.challenge_id,
      },
    });
  }

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

  const { data: completion, error: fetchError } = await supabase
    .from("challenge_completions")
    .select("id, user_id, challenge_id, challenges!inner(title)")
    .eq("id", completionId)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };

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

  if (completion?.user_id) {
    const challengeTitle =
      (completion as { challenges?: { title?: string } | null }).challenges?.title ??
      "your challenge";
    await emitNotification({
      userId: completion.user_id,
      kind: "challenge_verified",
      title: "Completion rejected",
      body: `“${challengeTitle}” was not verified: ${reason}`,
      icon: "xmark.seal.fill",
      metadata: {
        completion_id: completionId,
        challenge_id: completion.challenge_id,
        reason,
      },
    });
  }

  revalidatePath("/admin/completions");
  return { success: true };
}
