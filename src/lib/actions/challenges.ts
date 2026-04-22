"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  challengeDetailsSchema,
  challengeVerificationSchema,
  rewardSchema,
} from "@/lib/validations/challenge";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

export async function getMerchantChallenges() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("challenges")
    .select("*, places(name), rewards(*)")
    .eq("merchant_id", user.id)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getChallenge(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("challenges")
    .select("*, places(name, latitude, longitude), rewards(*)")
    .eq("id", id)
    .single();

  return data;
}

export async function getPlaces() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select("id, name, city, category")
    .eq("is_active", true)
    .order("name");

  return data ?? [];
}

export async function createChallenge(payload: {
  details: unknown;
  verification: unknown;
  reward: unknown;
}) {
  const detailsParsed = challengeDetailsSchema.safeParse(payload.details);
  if (!detailsParsed.success)
    return { error: detailsParsed.error.flatten().fieldErrors };

  const verifParsed = challengeVerificationSchema.safeParse(payload.verification);
  if (!verifParsed.success)
    return { error: { _form: ["Invalid verification settings"] } };

  const rewardParsed = rewardSchema.safeParse(payload.reward);
  if (!rewardParsed.success)
    return { error: rewardParsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: { _form: ["Not authenticated"] } };

  const challengeQR = `TT-CH-${randomUUID()}`;
  const rewardQR = `TT-RW-${randomUUID()}`;

  const { data: challenge, error: chError } = await supabase
    .from("challenges")
    .insert({
      merchant_id: user.id,
      ...detailsParsed.data,
      ...verifParsed.data,
      quiz_choices: verifParsed.data.quiz_choices
        ? JSON.stringify(verifParsed.data.quiz_choices)
        : null,
      qr_code_value: challengeQR,
      status: "draft",
    })
    .select("id")
    .single();

  if (chError) return { error: { _form: [chError.message] } };

  const { error: rwError } = await supabase.from("rewards").insert({
    challenge_id: challenge.id,
    merchant_id: user.id,
    ...rewardParsed.data,
    qr_code_value: rewardQR,
  });

  if (rwError) return { error: { _form: [rwError.message] } };

  revalidatePath("/challenges");
  return { success: true, challengeId: challenge.id };
}

export async function submitChallengeForReview(challengeId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("challenges")
    .update({
      status: "pending_review",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", challengeId);

  if (error) return { error: error.message };

  revalidatePath("/challenges");
  return { success: true };
}

export async function getAllChallenges(status?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("challenges")
    .select("*, places(name), rewards(*), profiles(display_name)")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data } = await query;
  return data ?? [];
}

export async function reviewChallenge(
  challengeId: string,
  action: "approved" | "rejected",
  notes?: string
) {
  const adminClient = createAdminClient();

  const updateData: Record<string, unknown> = {
    status: action === "approved" ? "live" : "rejected",
    admin_notes: notes ?? null,
  };

  if (action === "approved") {
    updateData.approved_at = new Date().toISOString();
  }

  const { error } = await adminClient
    .from("challenges")
    .update(updateData)
    .eq("id", challengeId);

  if (error) return { error: error.message };

  revalidatePath("/admin/challenges");
  return { success: true };
}
