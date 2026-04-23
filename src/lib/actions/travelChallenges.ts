"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth";
import {
  travelChallengeSchema,
  childChallengeSchema,
} from "@/lib/validations/marketplace";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

async function assertApprovedMerchant() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" as const };
  const isAdmin = user.role === "admin" || user.role === "superadmin";
  if (!isAdmin) {
    if (user.role !== "merchant") {
      return { error: "Merchant access required" as const };
    }
    if (user.merchant_request_status !== "approved") {
      return { error: "Your merchant account is not approved yet" as const };
    }
  }
  return { user };
}

async function getApprovedBusiness(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, verification_status, latitude, longitude, service_radius_meters")
    .eq("merchant_id", userId)
    .single();
  return data;
}

// Haversine distance in meters
function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
) {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) *
      Math.cos(toRad(bLat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function listTravelChallenges() {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const canViewAll = user.role === "admin" || user.role === "superadmin";
  const query = supabase
    .from("travel_challenges")
    .select(
      "*, challenges(count)"
    )
    .order("created_at", { ascending: false });

  if (!canViewAll) query.eq("merchant_id", user.id);
  const { data } = await query;
  return data ?? [];
}

export async function getTravelChallenge(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("travel_challenges")
    .select(
      "*, challenges(id, title, description, status, establishment_type, latitude, longitude, time_of_day_start, time_of_day_end, days_of_week, max_completions, current_completions, xp_reward, rewards(title, discount_type, discount_value))"
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

  const biz = await getApprovedBusiness(gate.user.id);
  if (!biz || biz.verification_status !== "approved") {
    return {
      error: {
        _form: [
          "Your business must be verified by an admin before creating travel challenges.",
        ],
      },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("travel_challenges")
    .insert({
      merchant_id: gate.user.id,
      business_id: biz.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      cover_url: parsed.data.cover_url || null,
      completion_mode: parsed.data.completion_mode,
      date_range_start: parsed.data.date_range_start || null,
      date_range_end: parsed.data.date_range_end || null,
      max_total_completions: parsed.data.max_total_completions ?? null,
      big_reward_title: parsed.data.big_reward_title || null,
      big_reward_description: parsed.data.big_reward_description || null,
      big_reward_discount_type: parsed.data.big_reward_discount_type ?? null,
      big_reward_discount_value: parsed.data.big_reward_discount_value ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { error: { _form: [error.message] } };
  revalidatePath("/admin/travel-challenges");
  return { success: true, id: data.id };
}

export async function updateTravelChallenge(id: string, input: unknown) {
  const parsed = travelChallengeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: { _form: [gate.error] } };

  const supabase = await createClient();
  const { error } = await supabase
    .from("travel_challenges")
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      cover_url: parsed.data.cover_url || null,
      completion_mode: parsed.data.completion_mode,
      date_range_start: parsed.data.date_range_start || null,
      date_range_end: parsed.data.date_range_end || null,
      max_total_completions: parsed.data.max_total_completions ?? null,
      big_reward_title: parsed.data.big_reward_title || null,
      big_reward_description: parsed.data.big_reward_description || null,
      big_reward_discount_type: parsed.data.big_reward_discount_type ?? null,
      big_reward_discount_value: parsed.data.big_reward_discount_value ?? null,
    })
    .eq("id", id);

  if (error) return { error: { _form: [error.message] } };
  revalidatePath(`/admin/travel-challenges/${id}`);
  return { success: true };
}

export async function submitTravelChallengeForReview(id: string) {
  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("travel_challenges")
    .update({
      status: "pending_review",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/travel-challenges/${id}`);
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

  revalidatePath(`/admin/manage/travel-challenges`);
  return { success: true };
}

export async function addChildChallenge(
  travelChallengeId: string,
  input: unknown
) {
  const parsed = childChallengeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: { _form: [gate.error] } };

  const supabase = await createClient();
  const { data: parent } = await supabase
    .from("travel_challenges")
    .select("id, merchant_id")
    .eq("id", travelChallengeId)
    .single();
  if (!parent) return { error: { _form: ["Travel challenge not found"] } };
  if (parent.merchant_id !== gate.user.id && gate.user.role === "merchant") {
    return { error: { _form: ["You don't own this travel challenge"] } };
  }

  const biz = await getApprovedBusiness(parent.merchant_id);
  if (!biz) return { error: { _form: ["Business profile missing"] } };
  if (biz.latitude != null && biz.longitude != null) {
    const dist = distanceMeters(
      biz.latitude,
      biz.longitude,
      parsed.data.latitude,
      parsed.data.longitude
    );
    if (dist > biz.service_radius_meters) {
      return {
        error: {
          _form: [
            `Challenge location is ${Math.round(dist)}m from your business � outside your ${biz.service_radius_meters}m service radius.`,
          ],
        },
      };
    }
  }

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
      status: "draft",
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
  revalidatePath(`/admin/travel-challenges/${travelChallengeId}`);
  return { success: true, id: ch.id };
}

export async function removeChildChallenge(childId: string) {
  const gate = await assertApprovedMerchant();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("challenges")
    .delete()
    .eq("id", childId);
  if (error) return { error: error.message };
  return { success: true };
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
