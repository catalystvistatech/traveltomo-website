"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth";
import { resolveMerchantScope, scopeAllowsWrite } from "@/lib/actions/scope";
import { recordActAsChange } from "@/lib/actions/actAs";
import {
  travelChallengeSchema,
  childChallengeSchema,
  TRAVEL_CHALLENGE_STOP_COUNT,
} from "@/lib/validations/marketplace";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

/**
 * Gate for every quest-content action.
 *
 * Returns three things that must not be conflated:
 *   user       the real signed-in human. Role checks read THIS.
 *   merchantId the tenancy target - whose content is being read/written.
 *              Equals user.id normally; the selected merchant while a
 *              superadmin is acting as one.
 *   scopeId    the merchant id to filter rows by, or null for unrestricted
 *              staff. Callers should write `if (gate.scopeId) q.eq(...)`
 *              rather than testing roles themselves.
 *
 * scopeId is null ONLY for staff who are not acting as anyone. A superadmin
 * who has entered act-as is deliberately NARROWED to that one merchant:
 * their reach while acting should be the merchant's, not the platform's.
 */
async function assertApprovedMerchant() {
  const scope = await resolveMerchantScope();
  if (!scope) return { error: "Not authenticated" as const };
  const user = scope.actor;
  const isAdmin = user.role === "admin" || user.role === "superadmin";
  if (!isAdmin) {
    if (user.role !== "merchant") {
      return { error: "Merchant access required" as const };
    }
    if (user.merchant_request_status !== "approved") {
      return { error: "Your merchant account is not approved yet" as const };
    }
  }
  // A read-only act-as session may browse but never mutate. Callers that
  // write check this; readers ignore it.
  const canWrite = scopeAllowsWrite(scope);
  return {
    user,
    merchantId: scope.merchantId,
    scopeId: isAdmin && !scope.actingAs ? null : scope.merchantId,
    actingAs: scope.actingAs,
    canWrite,
    scope,
  };
}

/**
 * Superadmins run the platform end to end and skip every admin-review
 * gate -- their businesses auto-approve and their travel challenges go
 * straight to `live` on submit.
 */
function isSuperadmin(role: string | undefined | null): boolean {
  return role === "superadmin";
}

function travelChallengePublishStopError(stopCount: number): string | null {
  if (stopCount >= TRAVEL_CHALLENGE_STOP_COUNT) return null;
  const remaining = TRAVEL_CHALLENGE_STOP_COUNT - stopCount;
  return `Quests need ${TRAVEL_CHALLENGE_STOP_COUNT} stops before publishing (matches the dice roll board). Add ${remaining} more stop${remaining === 1 ? "" : "s"}.`;
}

async function getApprovedBusiness(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, verification_status, latitude, longitude, service_radius_meters")
    .eq("merchant_id", userId)
    .order("created_at", { ascending: true });
  const rows = data ?? [];
  return rows.find((b) => b.verification_status === "approved") ?? rows[0] ?? null;
}

/**
 * Returns the calling merchant's library rewards (`challenge_id IS NULL`)
 * so the travel-challenge form can offer a "pick from library" dropdown
 * for the BIG REWARD slot.
 */
export async function listMerchantLibraryRewards() {
  // Scoped, not actor-keyed: this feeds the reward picker, and the action
  // that consumes the choice validates it against gate.merchantId. Keyed to
  // the operator, the picker would offer rewards the write then rejects.
  const scope = await resolveMerchantScope();
  if (!scope) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("rewards")
    .select("id, title, description, discount_type, discount_value")
    .eq("merchant_id", scope.merchantId)
    .is("challenge_id", null)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  return (data ?? []) as {
    id: string;
    title: string;
    description: string | null;
    discount_type: "percentage" | "fixed" | "freebie";
    discount_value: number | null;
  }[];
}

export async function listMerchantBusinesses() {
  // Scoped: createTravelChallenge validates the chosen business against
  // gate.merchantId, so an actor-keyed picker would list the operator's own
  // businesses and make creating a quest while acting impossible.
  const scope = await resolveMerchantScope();
  if (!scope) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, name, verification_status")
    .eq("merchant_id", scope.merchantId)
    .order("created_at", { ascending: true });
  return (data ?? []) as { id: string; name: string; verification_status: string }[];
}

export async function listTravelChallenges() {
  const scope = await resolveMerchantScope();
  if (!scope) return [];
  const supabase = await createClient();
  // Staff normally see every merchant's quests. While ACTING, the list must
  // NARROW to the target — otherwise the operator browses the whole platform
  // under a banner that claims one merchant, and can open (and edit) someone
  // else's quest by mistake.
  const isStaff =
    scope.actor.role === "admin" || scope.actor.role === "superadmin";
  const scopeId = isStaff && !scope.actingAs ? null : scope.merchantId;
  const query = supabase
    .from("travel_challenges")
    .select(
      "*, challenges(count)"
    )
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (scopeId) query.eq("merchant_id", scopeId);
  const { data } = await query;
  return data ?? [];
}

export async function getTravelChallenge(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("travel_challenges")
    .select(
      "*, challenges(id, title, description, status, establishment_type, latitude, longitude, time_of_day_start, time_of_day_end, days_of_week, max_completions, current_completions, xp_reward, duration_minutes, verification_type, rewards(title, description, discount_type, discount_value))"
    )
    .eq("id", id)
    .single();
  return data;
}

export async function createTravelChallenge(input: unknown) {
  const parsed = travelChallengeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: { _form: [gate.error] } };

  // If the merchant specified a business_id, verify it belongs to them.
  // Regular merchants must use an approved business; superadmins can use
  // any business they own (theirs auto-approve on create anyway).
  let selectedBizId: string | null = parsed.data.business_id || null;
  const bypass = isSuperadmin(gate.user.role);
  if (selectedBizId) {
    const supabaseCheck = await createClient();
    const { data: pickedBiz } = await supabaseCheck
      .from("businesses")
      .select("id, verification_status")
      .eq("id", selectedBizId)
      .eq("merchant_id", gate.merchantId)
      .maybeSingle();
    if (!pickedBiz) {
      return { error: { _form: ["The selected business doesn't belong to you."] } };
    }
    if (!bypass && pickedBiz.verification_status !== "approved") {
      return { error: { _form: ["The selected business is not verified yet."] } };
    }
  } else {
    const fallback = await getApprovedBusiness(gate.merchantId);
    if (!fallback) {
      return { error: { _form: ["Create a business first before adding quests."] } };
    }
    if (!bypass && fallback.verification_status !== "approved") {
      return { error: { _form: ["Your business must be verified by an admin before creating quests."] } };
    }
    selectedBizId = fallback.id;
  }

  const supabase = await createClient();

  const bigReward = await resolveBigReward({
    supabase,
    merchantId: gate.merchantId,
    source: parsed.data.big_reward_source,
    libraryRewardId: parsed.data.big_reward_reward_id || null,
    title: parsed.data.big_reward_title || null,
    description: parsed.data.big_reward_description || null,
    discountType: parsed.data.big_reward_discount_type ?? null,
    discountValue: parsed.data.big_reward_discount_value ?? null,
    saveToLibrary: !!parsed.data.big_reward_save_to_library,
  });
  if ("error" in bigReward) return { error: { _form: [bigReward.error] } };

  const { data, error } = await supabase
    .from("travel_challenges")
    .insert({
      merchant_id: gate.merchantId,
      business_id: selectedBizId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      cover_url: parsed.data.cover_url || null,
      completion_mode: parsed.data.completion_mode,
      date_range_start: parsed.data.date_range_start || null,
      date_range_end: parsed.data.date_range_end || null,
      max_total_completions: parsed.data.max_total_completions ?? null,
      big_reward_title: bigReward.title,
      big_reward_description: bigReward.description,
      big_reward_discount_type: bigReward.discountType,
      big_reward_discount_value: bigReward.discountValue,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { error: { _form: [error.message] } };
  await recordActAsChange(gate.scope, {
    action: "createTravelChallenge",
    entityType: "travel_challenge",
    entityId: data.id,
    after: { title: parsed.data.title },
  });
  revalidatePath("/admin", "layout");
  return { success: true, id: data.id };
}

/**
 * Normalises the big-reward portion of a travel challenge form into
 * the four denormalised columns we already store on `travel_challenges`
 * (title / description / discount_type / discount_value).
 *
 *   - source = "library": copy fields from the picked library reward.
 *     The library row itself is not modified -- the merchant can reuse
 *     it on another travel challenge or edit it independently.
 *   - source = "custom" (or unspecified): use the inline form fields.
 *     If saveToLibrary is true, also insert a row into `rewards` with
 *     `challenge_id = NULL` so the merchant can reuse this reward
 *     later from the picker.
 */
async function resolveBigReward(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  merchantId: string;
  source: "library" | "custom" | undefined;
  libraryRewardId: string | null;
  title: string | null;
  description: string | null;
  discountType: "percentage" | "fixed" | "freebie" | null;
  discountValue: number | null;
  saveToLibrary: boolean;
}): Promise<
  | {
      title: string | null;
      description: string | null;
      discountType: "percentage" | "fixed" | "freebie" | null;
      discountValue: number | null;
    }
  | { error: string }
> {
  if (args.source === "library" && args.libraryRewardId) {
    const { data: reward } = await args.supabase
      .from("rewards")
      .select("id, merchant_id, title, description, discount_type, discount_value")
      .eq("id", args.libraryRewardId)
      .maybeSingle();
    if (!reward || reward.merchant_id !== args.merchantId) {
      return { error: "The selected library reward doesn't belong to you." };
    }
    return {
      title: reward.title,
      description: reward.description,
      discountType: reward.discount_type,
      discountValue: reward.discount_value,
    };
  }

  // Custom reward path. Optionally persist a library copy.
  if (args.saveToLibrary && args.title) {
    const { error } = await args.supabase.from("rewards").insert({
      merchant_id: args.merchantId,
      challenge_id: null,
      title: args.title,
      description: args.description,
      discount_type: args.discountType ?? "freebie",
      discount_value: args.discountValue,
      is_active: true,
    });
    if (error) return { error: error.message };
  }

  return {
    title: args.title,
    description: args.description,
    discountType: args.discountType,
    discountValue: args.discountValue,
  };
}

export async function updateTravelChallenge(id: string, input: unknown) {
  const parsed = travelChallengeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: { _form: [gate.error] } };

  const supabase = await createClient();

  const bigReward = await resolveBigReward({
    supabase,
    merchantId: gate.merchantId,
    source: parsed.data.big_reward_source,
    libraryRewardId: parsed.data.big_reward_reward_id || null,
    title: parsed.data.big_reward_title || null,
    description: parsed.data.big_reward_description || null,
    discountType: parsed.data.big_reward_discount_type ?? null,
    discountValue: parsed.data.big_reward_discount_value ?? null,
    saveToLibrary: !!parsed.data.big_reward_save_to_library,
  });
  if ("error" in bigReward) return { error: { _form: [bigReward.error] } };

  const updatePayload: Record<string, unknown> = {
    title: parsed.data.title,
    description: parsed.data.description || null,
    cover_url: parsed.data.cover_url || null,
    completion_mode: parsed.data.completion_mode,
    date_range_start: parsed.data.date_range_start || null,
    date_range_end: parsed.data.date_range_end || null,
    max_total_completions: parsed.data.max_total_completions ?? null,
    big_reward_title: bigReward.title,
    big_reward_description: bigReward.description,
    big_reward_discount_type: bigReward.discountType,
    big_reward_discount_value: bigReward.discountValue,
  };
  if (parsed.data.business_id) {
    // Re-pointing a quest at a business is only allowed onto a business the
    // caller owns AND that is verified — mirroring createTravelChallenge.
    // Without this a merchant could attach their quest to any other
    // merchant's business by id, bypassing the create-time check. Staff
    // manage the marketplace and may re-point freely.
    // Scope, not role: which business a quest may point at is a TENANCY
    // decision. Keying it to the role let an acting superadmin stamp a
    // foreign merchant's business onto the quest they were "helping" with.
    if (gate.scopeId) {
      const { data: biz, error: bizError } = await supabase
        .from("businesses")
        .select("id, verification_status")
        .eq("id", parsed.data.business_id)
        .eq("merchant_id", gate.scopeId)
        .maybeSingle();
      if (bizError) return { error: { _form: [bizError.message] } };
      if (!biz) {
        return { error: { _form: ["The selected business doesn't belong to you."] } };
      }
      if (biz.verification_status !== "approved") {
        return { error: { _form: ["The selected business is not verified yet."] } };
      }
    }
    updatePayload.business_id = parsed.data.business_id;
  }
  // Ownership is enforced here rather than left to RLS alone: a merchant
  // may only edit their own quest. Staff may act on any row.
  const query = supabase
    .from("travel_challenges")
    .update(updatePayload)
    .eq("id", id);
  if (gate.scopeId) query.eq("merchant_id", gate.scopeId);
  // `.select()` so a scope-filtered update that matched NOTHING is caught.
  // PostgREST reports no error for a zero-row update, so without this the
  // action returned success and wrote an audit entry for a change that never
  // happened — the worst possible audit failure, a fabricated record.
  const { data: updated, error } = await query.select("id");

  if (error) return { error: { _form: [error.message] } };
  if (!updated || updated.length === 0) {
    return {
      error: { _form: ["Quest not found, or you don't have permission to edit it."] },
    };
  }
  await recordActAsChange(gate.scope, {
    action: "updateTravelChallenge",
    entityType: "travel_challenge",
    entityId: id,
    after: updatePayload,
  });
  revalidatePath("/admin", "layout");
  return { success: true };
}

/**
 * Publish a travel challenge. Currently every caller (merchant or
 * superadmin) goes straight to `live` -- the legacy two-stage admin
 * review for travel challenges has been retired in favour of just
 * verifying the underlying merchant + business. Superadmins benefit
 * from this implicitly: their auto-approved business plus this direct
 * publish means a single click takes them from draft to live.
 *
 * Publishing is blocked until the set has exactly
 * {@link TRAVEL_CHALLENGE_STOP_COUNT} stops — the same count the iOS
 * dice roll board expects. The UI disables Publish below that
 * threshold; this server check enforces it against direct API hits.
 */
export async function submitTravelChallengeForReview(id: string) {
  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();

  // Ownership is decided once, up front, rather than left to RLS alone.
  // Previously the parent update and the child-stop update below both
  // matched by quest id only, so under the permissive staff policies any
  // id sent by the client would have been published.
  const { data: quest, error: questError } = await supabase
    .from("travel_challenges")
    .select("id, merchant_id")
    .eq("id", id)
    .maybeSingle();
  if (questError) return { error: questError.message };
  if (!quest || (gate.scopeId && quest.merchant_id !== gate.scopeId)) {
    return { error: "Quest not found or not yours." };
  }

  const { count: stopCount, error: countError } = await supabase
    .from("challenges")
    .select("id", { count: "exact", head: true })
    .eq("travel_challenge_id", id);
  if (countError) return { error: countError.message };
  const publishStopError = travelChallengePublishStopError(stopCount ?? 0);
  if (publishStopError) return { error: publishStopError };

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("travel_challenges")
    .update({
      status: "live",
      submitted_at: now,
      approved_at: now,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await supabase
    .from("challenges")
    .update({ status: "live", approved_at: now })
    .eq("travel_challenge_id", id);

  await recordActAsChange(gate.scope, {
    action: "submitTravelChallengeForReview",
    entityType: "travel_challenge",
    entityId: id,
    after: { status: "live" },
  });
  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function reviewTravelChallenge(
  id: string,
  action: "approved" | "rejected",
  notes?: string
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return { error: "Only admins/superadmins can review" };
  }
  const admin = createAdminClient();

  if (action === "approved") {
    const { count: stopCount, error: countError } = await admin
      .from("challenges")
      .select("id", { count: "exact", head: true })
      .eq("travel_challenge_id", id);
    if (countError) return { error: countError.message };
    const publishStopError = travelChallengePublishStopError(stopCount ?? 0);
    if (publishStopError) return { error: publishStopError };
  }

  const { error } = await admin
    .from("travel_challenges")
    .update({
      status: action === "approved" ? "live" : "rejected",
      admin_notes: notes ?? null,
      approved_at: action === "approved" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  if (action === "approved") {
    await admin
      .from("challenges")
      .update({ status: "live", approved_at: new Date().toISOString() })
      .eq("travel_challenge_id", id);
  }

  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function addChildChallenge(
  travelChallengeId: string,
  input: unknown,
  // When true, the new stop is forced to `draft` even if the parent set is
  // already live -- lets a merchant stage a stop without exposing it to
  // players until the set is (re)published.
  asDraft = false
) {
  const parsed = childChallengeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: { _form: [gate.error] } };

  const supabase = await createClient();
  const { data: parent } = await supabase
    .from("travel_challenges")
    .select("id, merchant_id, business_id, status")
    .eq("id", travelChallengeId)
    .single();
  if (!parent) return { error: { _form: ["Quest not found"] } };
  // Scope, not role. The old form (`&& role === "merchant"`) short-circuited
  // for staff, so an acting superadmin — whose role is superadmin, not
  // merchant — could add a stop to a quest owned by a merchant OTHER than the
  // one they are acting as. The stop was then stamped with the parent's
  // owner while the audit row named the act-as target, misattributing both.
  if (gate.scopeId && parent.merchant_id !== gate.scopeId) {
    return { error: { _form: ["You don't own this quest"] } };
  }

  // When the parent quest is already published, stops added afterward
  // must inherit `live` status. Otherwise they stay `draft` forever
  // (the publish flow only runs from draft/rejected) and the iOS app
  // never counts them - the "0 / 2 stops" bug where a 6-stop quest
  // only shows the 2 stops that existed at publish time.
  const parentLive =
    (parent as { status?: string }).status === "live" ||
    (parent as { status?: string }).status === "approved";

  const { count } = await supabase
    .from("challenges")
    .select("id", { count: "exact", head: true })
    .eq("travel_challenge_id", travelChallengeId);
  if ((count ?? 0) >= TRAVEL_CHALLENGE_STOP_COUNT) {
    return {
      error: {
        _form: [
          `Maximum ${TRAVEL_CHALLENGE_STOP_COUNT} stops per quest.`,
        ],
      },
    };
  }

  const biz = await getApprovedBusiness(parent.merchant_id);
  if (!biz) return { error: { _form: ["Business profile missing"] } };

  const challengeQR = `TT-CH-${randomUUID()}`;
  const rewardQR = `TT-RW-${randomUUID()}`;

  const { data: ch, error: chErr } = await supabase
    .from("challenges")
    .insert({
      merchant_id: parent.merchant_id,
      travel_challenge_id: travelChallengeId,
      title: parsed.data.title,
      description: parsed.data.description,
      instructions: parsed.data.instructions || null,
      type: parsed.data.type,
      verification_type: parsed.data.verification_type,
      establishment_type: parsed.data.establishment_type ?? null,
      xp_reward: parsed.data.xp_reward,
      radius_meters: parsed.data.radius_meters,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      duration_minutes: parsed.data.duration_minutes ?? null,
      time_of_day_start: parsed.data.time_of_day_start || null,
      time_of_day_end: parsed.data.time_of_day_end || null,
      days_of_week: parsed.data.days_of_week,
      max_completions: parsed.data.max_completions ?? null,
      quiz_question: parsed.data.quiz_question || null,
      quiz_choices: parsed.data.quiz_choices
        ? JSON.stringify(parsed.data.quiz_choices)
        : null,
      quiz_answer: parsed.data.quiz_answer || null,
      qr_code_value: challengeQR,
      status: !asDraft && parentLive ? "live" : "draft",
      approved_at: !asDraft && parentLive ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (chErr) return { error: { _form: [chErr.message] } };

  const { error: rwErr } = await supabase.from("rewards").insert({
    challenge_id: ch.id,
    merchant_id: parent.merchant_id,
    title: parsed.data.reward_title,
    description: parsed.data.reward_description || null,
    discount_type: parsed.data.reward_discount_type,
    discount_value: parsed.data.reward_discount_value ?? null,
    max_redemptions: parsed.data.reward_max_redemptions ?? null,
    expires_at: parsed.data.reward_expires_at || null,
    qr_code_value: rewardQR,
  });

  if (rwErr) return { error: { _form: [rwErr.message] } };
  await recordActAsChange(gate.scope, {
    action: "addChildChallenge",
    entityType: "challenge",
    entityId: ch.id,
    after: { title: parsed.data.title },
  });
  revalidatePath("/admin", "layout");
  return { success: true, id: ch.id };
}

/**
 * Edit an existing child challenge inside a travel-challenge set.
 * Mirrors `addChildChallenge` -- same validation, same ownership +
 * radius checks -- but updates the row instead of inserting a new
 * one, and updates the linked reward in place (preserving its
 * `qr_code_value` so any merchant-side QR posters don't break).
 */
export async function updateChildChallenge(
  childId: string,
  input: unknown
) {
  const parsed = childChallengeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: { _form: [gate.error] } };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("challenges")
    .select("id, merchant_id, travel_challenge_id")
    .eq("id", childId)
    .maybeSingle();
  if (!existing) return { error: { _form: ["Challenge not found"] } };

  if (gate.scopeId && existing.merchant_id !== gate.scopeId) {
    return { error: { _form: ["You don't own this challenge"] } };
  }
  if (!existing.travel_challenge_id) {
    return { error: { _form: ["Challenge is not part of a travel-challenge set"] } };
  }

  const { error: chErr } = await supabase
    .from("challenges")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      instructions: parsed.data.instructions || null,
      type: parsed.data.type,
      verification_type: parsed.data.verification_type,
      establishment_type: parsed.data.establishment_type ?? null,
      xp_reward: parsed.data.xp_reward,
      radius_meters: parsed.data.radius_meters,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      duration_minutes: parsed.data.duration_minutes ?? null,
      time_of_day_start: parsed.data.time_of_day_start || null,
      time_of_day_end: parsed.data.time_of_day_end || null,
      days_of_week: parsed.data.days_of_week,
      max_completions: parsed.data.max_completions ?? null,
      quiz_question: parsed.data.quiz_question || null,
      quiz_choices: parsed.data.quiz_choices
        ? JSON.stringify(parsed.data.quiz_choices)
        : null,
      quiz_answer: parsed.data.quiz_answer || null,
    })
    .eq("id", childId);
  if (chErr) return { error: { _form: [chErr.message] } };

  // Update the linked reward in place. Most challenges have a single
  // reward row; if somehow there are multiple, we update them all so
  // the user-visible state matches the form (matches the 1:1 contract
  // the create flow assumes).
  const { error: rwErr } = await supabase
    .from("rewards")
    .update({
      title: parsed.data.reward_title,
      description: parsed.data.reward_description || null,
      discount_type: parsed.data.reward_discount_type,
      discount_value: parsed.data.reward_discount_value ?? null,
      max_redemptions: parsed.data.reward_max_redemptions ?? null,
      expires_at: parsed.data.reward_expires_at || null,
    })
    .eq("challenge_id", childId);
  if (rwErr) return { error: { _form: [rwErr.message] } };

  await recordActAsChange(gate.scope, {
    action: "updateChildChallenge",
    entityType: "challenge",
    entityId: childId,
    after: { title: parsed.data.title },
  });
  revalidatePath("/admin", "layout");
  return { success: true, id: childId };
}

export async function deleteTravelChallenge(id: string) {
  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: gate.error };

  // Preserve a reusable copy in the MERCHANT's quest-template library before
  // trashing, so a deleted quest can be re-created later even after the
  // 30-day trash window passes. Filed under the quest's owner (not the
  // caller) so a staff-initiated delete still leaves the merchant a copy.
  // If the snapshot can't be written, refuse to trash: a delete that
  // silently loses its only recovery copy is worse than one that fails
  // loudly. Previously the result was discarded and the quest was trashed
  // regardless.
  const snapshot = await saveQuestAsTemplate(id, { fileUnder: "owner" });
  if ("error" in snapshot) {
    return {
      error: `Couldn't save a recovery copy, so the quest was not deleted: ${snapshot.error}`,
    };
  }

  const supabase = await createClient();
  // Soft delete: move to the 30-day Trash instead of hard-deleting. Setting
  // status='deleted' also removes it from every traveler-facing query (which
  // filter status='live') without extra filters.
  let upd = supabase
    .from("travel_challenges")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (gate.scopeId) upd = upd.eq("merchant_id", gate.scopeId);
  const { error } = await upd;
  if (error) return { error: error.message };
  await recordActAsChange(gate.scope, {
    action: "deleteTravelChallenge",
    entityType: "travel_challenge",
    entityId: id,
  });
  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function restoreTravelChallenge(id: string) {
  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  // Restore as a draft so the merchant re-publishes (and admins re-review).
  let upd = supabase
    .from("travel_challenges")
    .update({ status: "draft", deleted_at: null })
    .eq("id", id)
    .eq("status", "deleted");
  if (gate.scopeId) upd = upd.eq("merchant_id", gate.scopeId);
  const { data: restored, error } = await upd.select("id");
  if (error) return { error: error.message };
  if (!restored || restored.length === 0) {
    return { error: "Quest not found, or you don't have permission to restore it." };
  }
  await recordActAsChange(gate.scope, {
    action: "restoreTravelChallenge",
    entityType: "travel_challenge",
    entityId: id,
    after: { status: "draft" },
  });
  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function purgeTravelChallenge(id: string) {
  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();

  // Capture the row BEFORE destroying it. This is a permanent delete that
  // cascades to the quest's stops, rewards, completions and player progress,
  // so it is the single most destructive action reachable while acting as a
  // merchant — and previously the one that left no record at all.
  const { data: doomed } = await supabase
    .from("travel_challenges")
    .select("id, merchant_id, title, status")
    .eq("id", id)
    .maybeSingle();

  let del = supabase
    .from("travel_challenges")
    .delete()
    .eq("id", id)
    .eq("status", "deleted");
  if (gate.scopeId) del = del.eq("merchant_id", gate.scopeId);
  const { data: purged, error } = await del.select("id");
  if (error) return { error: error.message };
  if (!purged || purged.length === 0) {
    return { error: "Quest not found, or you don't have permission to delete it." };
  }
  await recordActAsChange(gate.scope, {
    action: "purgeTravelChallenge",
    entityType: "travel_challenge",
    entityId: id,
    before: doomed ?? undefined,
  });
  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function listDeletedTravelChallenges() {
  const scope = await resolveMerchantScope();
  if (!scope) return [];
  const supabase = await createClient();
  // Narrow while acting, same rule as listTravelChallenges — this list feeds
  // restore and the permanent purge, so showing another merchant's trash here
  // would be worse than on the main list.
  const isStaff =
    scope.actor.role === "admin" || scope.actor.role === "superadmin";
  const scopeId = isStaff && !scope.actingAs ? null : scope.merchantId;
  const query = supabase
    .from("travel_challenges")
    .select("id, title, description, deleted_at, challenges(count)")
    .eq("status", "deleted")
    .order("deleted_at", { ascending: false });
  if (scopeId) query.eq("merchant_id", scopeId);
  const { data } = await query;
  return data ?? [];
}

// MARK: - Quest templates (whole-quest snapshots) --------------------------

export async function saveQuestAsTemplate(
  id: string,
  options: { fileUnder?: "owner" | "caller" } = {}
) {
  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();

  const { data: quest } = await supabase
    .from("travel_challenges")
    .select(
      "id, merchant_id, title, description, completion_mode, max_total_completions, big_reward_title, big_reward_description, big_reward_discount_type, big_reward_discount_value, challenges(title, description, instructions, type, verification_type, establishment_type, xp_reward, radius_meters, latitude, longitude, duration_minutes, time_of_day_start, time_of_day_end, days_of_week, max_completions, quiz_question, quiz_choices, quiz_answer, rewards(title, description, discount_type, discount_value))"
    )
    .eq("id", id)
    .maybeSingle();
  if (!quest) return { error: "Quest not found" };

  if (gate.scopeId && quest.merchant_id !== gate.scopeId) {
    return { error: "Not your quest" };
  }

  const stops = ((quest.challenges as Record<string, unknown>[]) ?? []).map((c) => {
    const reward = ((c.rewards as Record<string, unknown>[]) ?? [])[0] ?? null;
    return {
      title: c.title,
      description: c.description,
      instructions: c.instructions,
      type: c.type,
      verification_type: c.verification_type,
      establishment_type: c.establishment_type,
      xp_reward: c.xp_reward,
      radius_meters: c.radius_meters,
      latitude: c.latitude,
      longitude: c.longitude,
      duration_minutes: c.duration_minutes,
      time_of_day_start: c.time_of_day_start,
      time_of_day_end: c.time_of_day_end,
      days_of_week: c.days_of_week,
      max_completions: c.max_completions,
      quiz_question: c.quiz_question,
      quiz_choices: c.quiz_choices,
      quiz_answer: c.quiz_answer,
      reward: reward
        ? {
            title: reward.title,
            description: reward.description,
            discount_type: reward.discount_type,
            discount_value: reward.discount_value,
          }
        : null,
    };
  });

  const snapshot = {
    quest: {
      title: quest.title,
      description: quest.description,
      completion_mode: quest.completion_mode,
      max_total_completions: quest.max_total_completions,
      big_reward_title: quest.big_reward_title,
      big_reward_description: quest.big_reward_description,
      big_reward_discount_type: quest.big_reward_discount_type,
      big_reward_discount_value: quest.big_reward_discount_value,
    },
    stops,
  };

  // Two callers, two owners:
  //  - "owner"  (deleteTravelChallenge's recovery snapshot): file under the
  //    QUEST's owner so a merchant can restore a quest that staff deleted.
  //    Writing it under the caller used to put the snapshot in the staff
  //    member's own library, where the merchant could never find it.
  //  - "caller" (the explicit "Save as template" button, the default):
  //    file under whoever pressed it, so a staff bookmark lands in a
  //    library they can actually see and use.
  // For a merchant acting on their own quest both ids are identical. Staff
  // writing into another owner's library is permitted by migrations 055/056.
  // "caller" means the human who pressed the button — gate.user.id, NOT
  // gate.merchantId. While acting, merchantId is the TARGET, so using it here
  // collapsed both branches onto the same owner and a staff bookmark landed
  // in the merchant's library where the operator could never see it.
  const templateOwnerId =
    options.fileUnder === "owner" ? quest.merchant_id : gate.user.id;
  const { error } = await supabase.from("quest_templates").insert({
    merchant_id: templateOwnerId,
    title: quest.title as string,
    description: (quest.description as string | null) ?? null,
    stop_count: stops.length,
    snapshot,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function listQuestTemplates() {
  // Scoped: createQuestFromTemplate instantiates under gate.merchantId, so an
  // actor-keyed list would offer templates the merchant-scoped write can't use.
  const scope = await resolveMerchantScope();
  if (!scope) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("quest_templates")
    .select("id, title, description, stop_count, created_at")
    .eq("merchant_id", scope.merchantId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function deleteQuestTemplate(id: string) {
  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { data: removed, error } = await supabase
    .from("quest_templates")
    .delete()
    .eq("id", id)
    .eq("merchant_id", gate.merchantId)
    .select("id");
  if (error) return { error: error.message };
  if (!removed || removed.length === 0) {
    return { error: "Template not found, or you don't have permission to delete it." };
  }
  await recordActAsChange(gate.scope, {
    action: "deleteQuestTemplate",
    entityType: "quest_template",
    entityId: id,
  });
  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function createQuestFromTemplate(templateId: string) {
  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: { _form: [gate.error] } };
  const supabase = await createClient();

  const { data: tpl } = await supabase
    .from("quest_templates")
    .select("snapshot")
    .eq("id", templateId)
    .eq("merchant_id", gate.merchantId)
    .maybeSingle();
  if (!tpl) return { error: { _form: ["Template not found"] } };

  const snapshot = tpl.snapshot as {
    quest: Record<string, unknown>;
    stops: Record<string, unknown>[];
  };

  const biz = await getApprovedBusiness(gate.merchantId);
  if (!biz) return { error: { _form: ["Create a business first."] } };

  const q = snapshot.quest ?? {};
  const { data: quest, error: qErr } = await supabase
    .from("travel_challenges")
    .insert({
      merchant_id: gate.merchantId,
      business_id: biz.id,
      title: `${(q.title as string) ?? "Untitled quest"} (copy)`,
      description: (q.description as string | null) ?? null,
      status: "draft",
      completion_mode: (q.completion_mode as string) ?? "any",
      max_total_completions: (q.max_total_completions as number | null) ?? null,
      big_reward_title: (q.big_reward_title as string | null) ?? null,
      big_reward_description: (q.big_reward_description as string | null) ?? null,
      big_reward_discount_type: (q.big_reward_discount_type as string | null) ?? null,
      big_reward_discount_value: (q.big_reward_discount_value as number | null) ?? null,
    })
    .select("id")
    .single();
  if (qErr || !quest) {
    return { error: { _form: [qErr?.message ?? "Failed to create quest"] } };
  }

  for (const s of snapshot.stops ?? []) {
    const { data: ch } = await supabase
      .from("challenges")
      .insert({
        merchant_id: gate.merchantId,
        travel_challenge_id: quest.id,
        title: (s.title as string) ?? "Stop",
        description: (s.description as string) ?? "",
        instructions: (s.instructions as string | null) ?? null,
        type: (s.type as string) ?? "checkin",
        verification_type: (s.verification_type as string) ?? "photo_upload",
        establishment_type: (s.establishment_type as string | null) ?? null,
        xp_reward: (s.xp_reward as number) ?? 50,
        radius_meters: (s.radius_meters as number) ?? 50,
        latitude: (s.latitude as number | null) ?? null,
        longitude: (s.longitude as number | null) ?? null,
        duration_minutes: (s.duration_minutes as number | null) ?? null,
        time_of_day_start: (s.time_of_day_start as string | null) ?? null,
        time_of_day_end: (s.time_of_day_end as string | null) ?? null,
        days_of_week: (s.days_of_week as number[] | null) ?? [1, 2, 3, 4, 5, 6, 7],
        max_completions: (s.max_completions as number | null) ?? null,
        quiz_question: (s.quiz_question as string | null) ?? null,
        quiz_choices: s.quiz_choices ?? null,
        quiz_answer: (s.quiz_answer as string | null) ?? null,
        qr_code_value: `TT-CH-${randomUUID()}`,
        status: "draft",
      })
      .select("id")
      .single();
    if (!ch) continue;
    const reward = s.reward as Record<string, unknown> | null;
    if (reward) {
      await supabase.from("rewards").insert({
        challenge_id: ch.id,
        merchant_id: gate.merchantId,
        title: (reward.title as string) ?? "Reward",
        description: (reward.description as string | null) ?? null,
        discount_type: (reward.discount_type as string) ?? "freebie",
        discount_value: (reward.discount_value as number | null) ?? null,
        qr_code_value: `TT-RW-${randomUUID()}`,
      });
    }
  }

  await recordActAsChange(gate.scope, {
    action: "createQuestFromTemplate",
    entityType: "travel_challenge",
    entityId: quest.id as string,
    after: {
      title: snapshot.quest?.title ?? null,
      stops: (snapshot.stops ?? []).length,
      from_template: templateId,
    },
  });
  revalidatePath("/admin", "layout");
  return { success: true, id: quest.id as string };
}

export async function removeChildChallenge(childId: string) {
  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  // Ownership is enforced here rather than left to RLS alone: this was a
  // bare delete by id, so under the permissive staff policies any child
  // id sent by the client would have been removed.
  // Capture before destroying, so the audit says WHAT was removed rather
  // than just that something was.
  const { data: doomed } = await supabase
    .from("challenges")
    .select("id, merchant_id, title, travel_challenge_id")
    .eq("id", childId)
    .maybeSingle();

  const query = supabase
    .from("challenges")
    .delete()
    .eq("id", childId);
  if (gate.scopeId) query.eq("merchant_id", gate.scopeId);
  const { data: removed, error } = await query.select("id");
  if (error) return { error: error.message };
  if (!removed || removed.length === 0) {
    return { error: "Stop not found, or you don't have permission to remove it." };
  }
  await recordActAsChange(gate.scope, {
    action: "removeChildChallenge",
    entityType: "challenge",
    entityId: childId,
    before: doomed ?? undefined,
  });
  return { success: true };
}

export async function uploadTravelChallengeCover(formData: FormData) {
  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: gate.error };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "No file provided" };
  if (file.size > 5 * 1024 * 1024) return { error: "File must be under 5MB" };
  if (!file.type.startsWith("image/"))
    return { error: "Only image files are allowed" };

  // Filename includes a random UUID so each upload is a new cache key.
  // We don't reuse a stable filename + upsert anymore because the CDN
  // cache-control is now a year (immutable), and reusing the same URL
  // for new bytes would serve the old image until eviction.
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const path = `travel-challenges/${gate.merchantId}/${randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage
    .from("public-assets")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
      // Cover art never changes for a given URL (we rotate the filename
      // on replace), so let the CDN serve it for a year without
      // revalidating. Drops origin egress to ~0 for cold-launch waves.
      cacheControl: "31536000, immutable",
    });

  if (error) return { error: error.message };

  const { data: urlData } = admin.storage
    .from("public-assets")
    .getPublicUrl(path);

  return { success: true, url: urlData.publicUrl };
}

export async function cloneTemplateIntoTravelChallenge(
  travelChallengeId: string,
  templateId: string,
  overrides: {
    latitude: number;
    longitude: number;
    reward_title: string;
    reward_discount_type: "percentage" | "fixed" | "freebie";
    reward_discount_value?: number;
  }
) {
  const supabase = await createClient();
  const { data: template } = await supabase
    .from("challenge_templates")
    .select("*")
    .eq("id", templateId)
    .single();
  if (!template) return { error: "Template not found" };

  const choices = template.quiz_choices as unknown as string[] | null;

  const input = {
    title: template.title,
    description: template.description,
    instructions: template.instructions ?? "",
    type: "checkin" as const,
    verification_type:
      (template.verification_type as
        | "gps"
        | "qr_scan"
        | "photo_upload"
        | "quiz_answer") ?? "gps",
    establishment_type: template.establishment_type ?? undefined,
    xp_reward: template.suggested_xp ?? 50,
    radius_meters: template.suggested_radius_meters ?? 50,
    latitude: overrides.latitude,
    longitude: overrides.longitude,
    days_of_week: [1, 2, 3, 4, 5, 6, 7],
    quiz_question: template.quiz_question ?? "",
    quiz_choices: choices ?? undefined,
    quiz_answer: template.quiz_answer ?? "",
    reward_title: overrides.reward_title,
    reward_discount_type: overrides.reward_discount_type,
    reward_discount_value: overrides.reward_discount_value,
  };

  const result = await addChildChallenge(travelChallengeId, input);
  if ("error" in result) return result;

  if (result.success) {
    await supabase
      .from("challenges")
      .update({ template_id: templateId })
      .eq("id", result.id);
  }
  return result;
}
