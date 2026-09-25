"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { emitNotification } from "@/lib/notifications/emit";
import { revalidatePath } from "next/cache";

export async function listPendingCompletions(limit = 50, offset = 0) {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();

  const canViewAll = user.role === "admin" || user.role === "superadmin";
  const query = supabase
    .from("challenge_completions")
    .select(
      "id, user_id, challenge_id, verification_status, verification_code, completed_at, gps_latitude, gps_longitude, proof_url, challenges!inner(id, title, merchant_id, rewards(id, title, discount_type, discount_value))"
    )
    .order("completed_at", { ascending: false })
    .range(offset, offset + limit - 1);

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

  // Ownership is enforced on the fetch rather than left to RLS alone: a
  // merchant may only act on completions of their own challenges, and the
  // update below only runs once this lookup has succeeded. Previously both
  // the fetch and the update matched by completion id alone, so under the
  // permissive staff policies any id sent by the client was accepted.
  const isStaff = user.role === "admin" || user.role === "superadmin";
  const fetchQuery = supabase
    .from("challenge_completions")
    .select("id, user_id, challenge_id, completed_at, challenges!inner(title, merchant_id)")
    .eq("id", completionId);
  if (!isStaff) fetchQuery.eq("challenges.merchant_id", user.id);
  const { data: completion, error: fetchError } = await fetchQuery.maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!completion) return { error: "Completion not found or not yours." };

  const { data: updated, error } = await supabase
    .from("challenge_completions")
    .update({
      verification_status: "verified",
      verified_at: new Date().toISOString(),
      verified_by: user.id,
      reward_released: true,
      // Close out the stop: a verified stop is a finished stop. Without
      // these, the row stays "in-flight" (completed_at null / status
      // ongoing) and the accept route blocks the player from starting any
      // new stop in the quest.
      player_status: "claimed",
      completed_at:
        (completion as { completed_at?: string | null } | null)?.completed_at ??
        new Date().toISOString(),
    })
    .eq("id", completionId)
    .select("id");
  if (error) return { error: error.message };
  // An update that RLS silently filtered to zero rows is not a success.
  // Staff hold SELECT but no UPDATE policy on challenge_completions, so
  // without this check a staff verify reported success and pushed a
  // "Reward unlocked" notification while nothing had actually changed.
  if (!updated || updated.length === 0) {
    return { error: "Completion not found, or you don't have permission to update it." };
  }

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

  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function rejectCompletion(
  completionId: string,
  reason: string
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const supabase = await createClient();

  // Ownership is enforced on the fetch rather than left to RLS alone: a
  // merchant may only act on completions of their own challenges, and the
  // update below only runs once this lookup has succeeded. Previously both
  // the fetch and the update matched by completion id alone, so under the
  // permissive staff policies any id sent by the client was accepted.
  const isStaff = user.role === "admin" || user.role === "superadmin";
  const fetchQuery = supabase
    .from("challenge_completions")
    .select("id, user_id, challenge_id, completed_at, challenges!inner(title, merchant_id)")
    .eq("id", completionId);
  if (!isStaff) fetchQuery.eq("challenges.merchant_id", user.id);
  const { data: completion, error: fetchError } = await fetchQuery.maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!completion) return { error: "Completion not found or not yours." };

  const { data: updated, error } = await supabase
    .from("challenge_completions")
    .update({
      verification_status: "rejected",
      verified_at: new Date().toISOString(),
      verified_by: user.id,
      rejection_reason: reason,
      // Terminal state: forfeited stops are no longer in-flight (so a new
      // stop can be accepted) and become rollable again via
      // derivePlayerStopStatus(forfeited -> available).
      player_status: "forfeited",
      completed_at:
        (completion as { completed_at?: string | null } | null)?.completed_at ??
        new Date().toISOString(),
    })
    .eq("id", completionId)
    .select("id");
  if (error) return { error: error.message };
  // An update that RLS silently filtered to zero rows is not a success.
  // Staff hold SELECT but no UPDATE policy on challenge_completions, so
  // without this check a staff reject reported success and pushed a
  // rejection notification while nothing had actually changed.
  if (!updated || updated.length === 0) {
    return { error: "Completion not found, or you don't have permission to update it." };
  }

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

  revalidatePath("/admin", "layout");
  return { success: true };
}
