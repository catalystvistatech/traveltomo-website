"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth";
import {
  extendedBusinessSchema,
  type ExtendedBusinessInput,
} from "@/lib/validations/marketplace";
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
    .maybeSingle();
  return data;
}

export async function upsertBusiness(formData: ExtendedBusinessInput) {
  const parsed = extendedBusinessSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: { _form: ["Not authenticated"] } };

  const existing = await supabase
    .from("businesses")
    .select("id, verification_status")
    .eq("merchant_id", user.id)
    .maybeSingle();

  const shouldRevert =
    existing.data?.verification_status === "approved" ||
    existing.data?.verification_status === "rejected";

  const payload = {
    merchant_id: user.id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    address: parsed.data.address,
    city: parsed.data.city,
    category: parsed.data.establishment_type,
    establishment_type: parsed.data.establishment_type,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    service_radius_meters: parsed.data.service_radius_meters,
    timezone: parsed.data.timezone,
    contact_email: parsed.data.contact_email || null,
    contact_phone: parsed.data.contact_phone || null,
    website: parsed.data.website || null,
    hours: parsed.data.hours,
    google_place_id: parsed.data.google_place_id || null,
    verification_status: shouldRevert ? "pending" : undefined,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("businesses")
    .upsert(payload, { onConflict: "merchant_id" });

  if (error) return { error: { _form: [error.message] } };
  revalidatePath("/admin/business");
  return { success: true };
}

export async function submitBusinessForVerification() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ verification_status: "pending" })
    .eq("merchant_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/business");
  return { success: true };
}

export async function listBusinessVerificationQueue() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return [];
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("businesses")
    .select(
      "id, merchant_id, name, address, city, establishment_type, latitude, longitude, verification_status, hours, service_radius_meters, contact_email, contact_phone, profiles:merchant_id(display_name)"
    )
    .in("verification_status", ["pending", "unsubmitted"])
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function reviewBusiness(
  businessId: string,
  decision: "approved" | "rejected" | "suspended",
  notes?: string
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return { error: "Not authorized" };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("businesses")
    .update({
      verification_status: decision,
      verified_at: decision === "approved" ? new Date().toISOString() : null,
      verified_by: user.id,
      verification_notes: notes ?? null,
    })
    .eq("id", businessId);
  if (error) return { error: error.message };
  revalidatePath("/admin/manage/businesses");
  return { success: true };
}
