"use server";

import { createClient } from "@/lib/supabase/server";
import { businessSchema, type BusinessData } from "@/lib/validations/challenge";
import { revalidatePath } from "next/cache";

export async function getBusiness() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("businesses")
    .select("*")
    .eq("merchant_id", user.id)
    .single();

  return data;
}

export async function upsertBusiness(formData: BusinessData) {
  const parsed = businessSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: { _form: ["Not authenticated"] } };

  const { error } = await supabase.from("businesses").upsert(
    {
      merchant_id: user.id,
      ...parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "merchant_id" }
  );

  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/business");
  return { success: true };
}
