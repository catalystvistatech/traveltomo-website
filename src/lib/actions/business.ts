"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth";
import {
  extendedBusinessSchema,
  type ExtendedBusinessInput,
} from "@/lib/validations/marketplace";
import { revalidatePath } from "next/cache";

// ─── Merchant: own businesses ──────────────────────────────────────────────

export async function getBusinesses() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("businesses")
    .select("*")
    .eq("merchant_id", user.id)
    .order("created_at", { ascending: true });
  return data ?? [];
}

/**
 * Create a new business (businessId omitted) or update an existing one
 * (businessId provided). Merchants can only touch their own rows.
 */
export async function upsertBusiness(
  formData: ExtendedBusinessInput,
  businessId?: string
) {
  const parsed = extendedBusinessSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: { _form: ["Not authenticated"] } };

  const now = new Date().toISOString();

  if (businessId) {
    // Update — verify ownership first
    const { data: existing } = await supabase
      .from("businesses")
      .select("id, merchant_id, verification_status")
      .eq("id", businessId)
      .eq("merchant_id", user.id)
      .maybeSingle();

    if (!existing) return { error: { _form: ["Business not found or not yours."] } };

    const shouldRevert =
      existing.verification_status === "approved" ||
      existing.verification_status === "rejected";

    const { error } = await supabase
      .from("businesses")
      .update({
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
        ...(shouldRevert ? { verification_status: "pending" } : {}),
        updated_at: now,
      })
      .eq("id", businessId);

    if (error) return { error: { _form: [error.message] } };
  } else {
    // Insert new business
    const { error } = await supabase
      .from("businesses")
      .insert({
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
        verification_status: "unsubmitted",
      });

    if (error) return { error: { _form: [error.message] } };
  }

  revalidatePath("/admin/business");
  return { success: true };
}

export async function submitBusinessForVerification(businessId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ verification_status: "pending" })
    .eq("id", businessId)
    .eq("merchant_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/business");
  return { success: true };
}

export async function deleteBusiness(businessId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .delete()
    .eq("id", businessId)
    .eq("merchant_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/business");
  return { success: true };
}

// ─── Admin: business verification queue ───────────────────────────────────

export async function listBusinessVerificationQueue() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return [];
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("businesses")
    .select(
      "id, merchant_id, name, address, city, establishment_type, latitude, longitude, verification_status, hours, service_radius_meters, contact_email, contact_phone, profiles!businesses_merchant_id_fkey(display_name)"
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

// ─── Superadmin: manage any merchant's businesses ─────────────────────────

export async function getBusinessesByMerchantId(merchantId: string) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("businesses")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function upsertBusinessAsAdmin(
  merchantId: string,
  formData: ExtendedBusinessInput & { verification_status?: string },
  businessId?: string
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { error: { _form: ["Only superadmins can edit merchant businesses."] } };
  }

  const parsed = extendedBusinessSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    merchant_id: merchantId,
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
    updated_at: now,
  };

  if (formData.verification_status) {
    payload.verification_status = formData.verification_status;
    if (formData.verification_status === "approved") {
      payload.verified_at = now;
      payload.verified_by = user.id;
    }
  }

  if (businessId) {
    const { error } = await admin
      .from("businesses")
      .update(payload)
      .eq("id", businessId);
    if (error) return { error: { _form: [error.message] } };
  } else {
    const { error } = await admin
      .from("businesses")
      .insert({ ...payload, verification_status: formData.verification_status ?? "unsubmitted" });
    if (error) return { error: { _form: [error.message] } };
  }

  revalidatePath(`/admin/manage/merchants/${merchantId}`);
  revalidatePath("/admin/manage/merchants");
  return { success: true };
}

export async function deleteBusinessAsAdmin(businessId: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") return { error: "Only superadmins can delete businesses." };
  const admin = createAdminClient();
  const { error } = await admin.from("businesses").delete().eq("id", businessId);
  if (error) return { error: error.message };
  revalidatePath("/admin/manage/merchants");
  return { success: true };
}
