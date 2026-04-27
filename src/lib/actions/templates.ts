"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { templateSchema } from "@/lib/validations/marketplace";
import { revalidatePath } from "next/cache";

function requireAdmin(role: string | null | undefined) {
  return role === "admin" || role === "superadmin";
}

export async function listTemplates() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("challenge_templates")
    .select("*, profiles:created_by(display_name)")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function createTemplate(input: unknown) {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const user = await getCurrentUser();
  if (!user) return { error: { _form: ["Not authenticated"] } };
  if (!requireAdmin(user.role)) {
    return { error: { _form: ["Only admins/superadmins can author templates"] } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("challenge_templates")
    .insert({
      ...parsed.data,
      cover_url: parsed.data.cover_url || null,
      instructions: parsed.data.instructions || null,
      quiz_question: parsed.data.quiz_question || null,
      quiz_answer: parsed.data.quiz_answer || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: { _form: [error.message] } };
  revalidatePath("/admin/templates");
  return { success: true, id: data.id };
}

export async function updateTemplate(id: string, input: unknown) {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) {
    return { error: { _form: ["Only admins/superadmins can edit templates"] } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("challenge_templates")
    .update({
      ...parsed.data,
      cover_url: parsed.data.cover_url || null,
      instructions: parsed.data.instructions || null,
      quiz_question: parsed.data.quiz_question || null,
      quiz_answer: parsed.data.quiz_answer || null,
    })
    .eq("id", id);

  if (error) return { error: { _form: [error.message] } };
  revalidatePath("/admin/templates");
  return { success: true };
}

export async function deleteTemplate(id: string) {
  const user = await getCurrentUser();
  if (!user || !requireAdmin(user.role)) {
    return { error: "Only admins/superadmins can delete templates" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("challenge_templates")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/templates");
  return { success: true };
}

export async function listPublishedTemplates() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("challenge_templates")
    .select("id, title, description, instructions, establishment_type, suggested_xp, suggested_radius_meters, verification_type, quiz_question, quiz_choices, quiz_answer, cover_url")
    .eq("is_published", true)
    .order("created_at", { ascending: false });
  return data ?? [];
}
