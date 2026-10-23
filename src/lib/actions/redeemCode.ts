"use server";

// One box for every code a traveler can show at the counter:
//   ABC123        a quest stop reward (challenge_completions.verification_code)
//   TT-BR-XXXXXX  a quest's big reward (travel_challenge_progress)
//   TT-SC-XXXXXX  a stamp-card freebie (stamp_card_rewards)
// lookupCode() previews who it is and what to hand over; redeemCode() does
// it. Ownership: only the merchant whose quest/card it is (or staff).

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMerchantScope, scopeAllowsWrite } from "@/lib/actions/scope";
import { recordActAsChange } from "@/lib/actions/actAs";
import { verifyCompletion } from "@/lib/actions/completions";
import { emitNotification } from "@/lib/notifications/emit";
import { STAMP_REWARD_PREFIX, redeemStampReward } from "@/lib/stamps";

export type CodePreview = {
  code: string;
  kind: "stop" | "big_reward" | "stamp_reward";
  traveler: string;
  /** What to hand over, e.g. "Free drink". */
  reward: string;
  /** Where it was earned, e.g. the quest stop or stamp card title. */
  context: string;
  proofUrl: string | null;
  /** Already handed over / approved. */
  done: boolean;
  /** Can't be redeemed yet (e.g. a stop the traveler hasn't submitted). */
  blockedReason: string | null;
};

const BIG_REWARD_PREFIX = "TT-BR-";

function normalize(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

async function scopeFor() {
  const scope = await resolveMerchantScope();
  if (!scope) return null;
  const isStaff = scope.actor.role === "admin" || scope.actor.role === "superadmin";
  // Non-acting staff may look at any merchant's codes; everyone else only
  // their own (a superadmin acting as a merchant is narrowed to that one).
  return { scope, merchantScopeId: isStaff && !scope.actingAs ? null : scope.merchantId };
}

export async function lookupCode(raw: string): Promise<{ preview: CodePreview } | { error: string }> {
  const code = normalize(raw);
  if (code.length < 4) return { error: "Type the code the customer is showing." };
  const ctx = await scopeFor();
  if (!ctx) return { error: "Not authenticated" };
  const admin = createAdminClient();

  if (code.startsWith(STAMP_REWARD_PREFIX)) {
    const { data } = await admin
      .from("stamp_card_rewards")
      .select("reward_title, redeemed_at, user:profiles!stamp_card_rewards_user_id_fkey ( display_name ), card:stamp_cards!inner ( title, merchant_id )")
      .eq("claim_code", code)
      .maybeSingle();
    const card = (data as unknown as { card?: { title: string; merchant_id: string } } | null)?.card;
    if (!data || !card || (ctx.merchantScopeId && card.merchant_id !== ctx.merchantScopeId)) {
      return { error: "No freebie found for that code at your business." };
    }
    return {
      preview: {
        code,
        kind: "stamp_reward",
        traveler: (data as unknown as { user?: { display_name?: string | null } }).user?.display_name ?? "Traveler",
        reward: data.reward_title as string,
        context: `Full stamp card · ${card.title}`,
        proofUrl: null,
        done: !!data.redeemed_at,
        blockedReason: null,
      },
    };
  }

  if (code.startsWith(BIG_REWARD_PREFIX)) {
    const { data } = await admin
      .from("travel_challenge_progress")
      .select("status, big_reward_redeemed_at, user:profiles!travel_challenge_progress_user_id_fkey ( display_name ), quest:travel_challenges!inner ( title, merchant_id, big_reward_title )")
      .eq("big_reward_claim_code", code)
      .maybeSingle();
    const quest = (data as unknown as { quest?: { title: string; merchant_id: string; big_reward_title: string | null } } | null)?.quest;
    if (!data || !quest || (ctx.merchantScopeId && quest.merchant_id !== ctx.merchantScopeId)) {
      return { error: "No big reward found for that code at your business." };
    }
    return {
      preview: {
        code,
        kind: "big_reward",
        traveler: (data as unknown as { user?: { display_name?: string | null } }).user?.display_name ?? "Traveler",
        reward: quest.big_reward_title ?? "Big reward",
        context: `Finished every stop · ${quest.title}`,
        proofUrl: null,
        done: !!data.big_reward_redeemed_at,
        blockedReason: data.status === "completed" ? null : "This traveler hasn't finished every stop yet.",
      },
    };
  }

  const { data } = await admin
    .from("challenge_completions")
    .select("verification_status, completed_at, player_status, proof_url, user:profiles!challenge_completions_user_id_fkey ( display_name ), challenge:challenges!inner ( title, merchant_id, rewards ( title ) )")
    .eq("verification_code", code)
    .maybeSingle();
  const stop = (data as unknown as { challenge?: { title: string; merchant_id: string; rewards?: { title: string }[] | null } } | null)?.challenge;
  if (!data || !stop || (ctx.merchantScopeId && stop.merchant_id !== ctx.merchantScopeId)) {
    return { error: "No reward found for that code at your business. Check the letters and try again." };
  }
  const submitted = data.completed_at != null && data.player_status !== "skipped" && data.player_status !== "expired";
  return {
    preview: {
      code,
      kind: "stop",
      traveler: (data as unknown as { user?: { display_name?: string | null } }).user?.display_name ?? "Traveler",
      reward: stop.rewards?.[0]?.title ?? "Stop reward",
      context: `Quest stop · ${stop.title}`,
      proofUrl: (data.proof_url as string | null) ?? null,
      done: data.verification_status === "verified",
      blockedReason:
        data.verification_status === "rejected"
          ? "This visit was rejected."
          : submitted
            ? null
            : "The traveler hasn't submitted this stop yet.",
    },
  };
}

export async function redeemCode(raw: string): Promise<{ success: true; message: string } | { error: string }> {
  const looked = await lookupCode(raw);
  if ("error" in looked) return looked;
  const { preview } = looked;
  if (preview.done) return { error: "This was already given out." };
  if (preview.blockedReason) return { error: preview.blockedReason };

  const ctx = await scopeFor();
  if (!ctx) return { error: "Not authenticated" };
  if (!scopeAllowsWrite(ctx.scope)) return { error: "Read-only access." };
  const admin = createAdminClient();

  if (preview.kind === "stamp_reward") {
    const r = await redeemStampReward(admin, preview.code, ctx.scope.actor.id, ctx.merchantScopeId);
    if (!r.ok) return { error: r.message };
    await emitNotification({
      userId: r.userId,
      kind: "reward_ready",
      title: "Freebie claimed",
      body: `Enjoy your ${r.rewardTitle}! Your ${r.cardTitle} card starts fresh.`,
      icon: "gift.fill",
      metadata: { stamp_reward_id: r.rewardId },
    });
  } else if (preview.kind === "big_reward") {
    const now = new Date().toISOString();
    const { data: updated, error } = await admin
      .from("travel_challenge_progress")
      .update({ big_reward_redeemed_at: now, big_reward_redeemed_by: ctx.scope.actor.id, updated_at: now })
      .eq("big_reward_claim_code", preview.code)
      .eq("status", "completed")
      .is("big_reward_redeemed_at", null)
      .select("id, user_id, travel_challenge_id");
    if (error) return { error: error.message };
    if (!updated?.length) return { error: "This was already given out." };
    await emitNotification({
      userId: updated[0].user_id as string,
      kind: "big_reward_redeemed",
      title: "Big reward redeemed",
      body: `${preview.reward} has been handed over. Congratulations!`,
      icon: "trophy.fill",
      metadata: { progress_id: updated[0].id, travel_challenge_id: updated[0].travel_challenge_id },
    });
  } else {
    // Same path as the Approve Visits page: closes out the stop, completes
    // the quest when it was the last one, and notifies the traveler.
    const { data: row } = await admin
      .from("challenge_completions")
      .select("id")
      .eq("verification_code", preview.code)
      .maybeSingle();
    if (!row) return { error: "No reward found for that code." };
    const r = await verifyCompletion(row.id as string);
    if ("error" in r && r.error) return { error: r.error };
  }

  await recordActAsChange(ctx.scope, {
    action: "redeemCode",
    entityType: preview.kind,
    after: { code: preview.code },
  });
  revalidatePath("/admin", "layout");
  return { success: true, message: `Give ${preview.traveler}: ${preview.reward}` };
}

/** Visits the traveler submitted that still need an approve/reject. */
export async function countVisitsToApprove(): Promise<number> {
  const ctx = await scopeFor();
  if (!ctx) return 0;
  const admin = createAdminClient();
  let q = admin
    .from("challenge_completions")
    .select("id, challenges!inner(merchant_id)", { count: "exact", head: true })
    .eq("verification_status", "pending")
    .not("completed_at", "is", null)
    .or("player_status.is.null,player_status.not.in.(skipped,expired)");
  if (ctx.merchantScopeId) q = q.eq("challenges.merchant_id", ctx.merchantScopeId);
  const { count } = await q;
  return count ?? 0;
}
