"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth";
import {
  extendedBusinessSchema,
  type ExtendedBusinessInput,
} from "@/lib/validations/marketplace";
import { revalidatePath } from "next/cache";

/**
 * Superadmins own their own businesses too -- they manage the platform end
 * to end -- and shouldn't have to wait for someone else to approve them.
 * This helper centralises the "is this user allowed to skip the admin
 * verification queue?" check so every business / challenge action stays
 * in sync. `admin` is deliberately NOT included: ordinary admins still
 * review their own work through the regular queue.
 */
function canBypassVerification(role: string | undefined | null): boolean {
  return role === "superadmin";
}

/**
 * Gate every business CRUD action. A pending merchant should NOT be
 * able to create or edit a business -- the merchant application has
 * to be approved by an admin first. Admins and superadmins always
 * pass through.
 *
 * Without this, a fresh signup that picked "merchant" during register
 * lands on the dashboard with role=merchant + merchant_request_status
 * =pending and can still write businesses, which is the security
 * red flag we hit on 2026-05-13.
 */
async function assertBusinessWriteAllowed():
  Promise<{ user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  if (user.role === "admin" || user.role === "superadmin") {
    return { user };
  }
  if (user.role !== "merchant") {
    return { error: "Merchant access required." };
  }
  if (user.merchant_request_status !== "approved") {
    return {
      error:
        "Your merchant account is still pending admin approval. You'll be able to create a business once an admin reviews your request.",
    };
  }
  return { user };
}

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

  const gate = await assertBusinessWriteAllowed();
  if ("error" in gate) return { error: { _form: [gate.error] } };
  const profile = gate.user;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: { _form: ["Not authenticated"] } };

  const bypass = canBypassVerification(profile.role);
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

    // Superadmins manage the platform; their own business edits stay
    // auto-approved instead of bouncing back into the review queue.
    const statusPatch: Record<string, unknown> = {};
    if (bypass) {
      statusPatch.verification_status = "approved";
      statusPatch.verified_at = now;
      statusPatch.verified_by = user.id;
    } else if (
      existing.verification_status === "approved" ||
      existing.verification_status === "rejected"
    ) {
      statusPatch.verification_status = "pending";
    }

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
        ...statusPatch,
        updated_at: now,
      })
      .eq("id", businessId);

    if (error) return { error: { _form: [error.message] } };
  } else {
    // Insert new business. Superadmins skip the verification queue and
    // start out approved so they can immediately attach challenges.
    const insertPayload: Record<string, unknown> = {
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
      verification_status: bypass ? "approved" : "unsubmitted",
    };
    if (bypass) {
      insertPayload.verified_at = now;
      insertPayload.verified_by = user.id;
    }
    const { error } = await supabase.from("businesses").insert(insertPayload);
    if (error) return { error: { _form: [error.message] } };
  }

  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function submitBusinessForVerification(businessId: string) {
  const gate = await assertBusinessWriteAllowed();
  if ("error" in gate) return { error: gate.error };
  const user = gate.user;
  const supabase = await createClient();
  // Superadmins self-approve on submit; everyone else lands in the
  // pending queue for an admin to review.
  const bypass = canBypassVerification(user.role);
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = bypass
    ? { verification_status: "approved", verified_at: now, verified_by: user.id }
    : { verification_status: "pending" };
  const { error } = await supabase
    .from("businesses")
    .update(payload)
    .eq("id", businessId)
    .eq("merchant_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function deleteBusiness(businessId: string) {
  const gate = await assertBusinessWriteAllowed();
  if ("error" in gate) return { error: gate.error };
  const user = gate.user;
  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .delete()
    .eq("id", businessId)
    .eq("merchant_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { success: true };
}

/** Convenience wrapper — returns the first business for the current merchant. */
export async function getBusiness() {
  const all = await getBusinesses();
  return all[0] ?? null;
}

/**
 * Tells the Business Profile UI whether it should render in a writable
 * state. Pending merchants get a read-only / locked page until an admin
 * approves their account.
 */
export async function getBusinessAccessState() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      canWrite: false,
      reason: "unauthenticated" as const,
      role: null as null,
      merchantStatus: null as null,
    };
  }
  if (user.role === "admin" || user.role === "superadmin") {
    return {
      canWrite: true,
      reason: null,
      role: user.role,
      merchantStatus: user.merchant_request_status,
    };
  }
  if (user.role !== "merchant") {
    return {
      canWrite: false,
      reason: "not_merchant" as const,
      role: user.role,
      merchantStatus: user.merchant_request_status,
    };
  }
  if (user.merchant_request_status !== "approved") {
    return {
      canWrite: false,
      reason: "merchant_pending" as const,
      role: user.role,
      merchantStatus: user.merchant_request_status,
    };
  }
  return {
    canWrite: true,
    reason: null,
    role: user.role,
    merchantStatus: user.merchant_request_status,
  };
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
  revalidatePath("/admin", "layout");
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

  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function deleteBusinessAsAdmin(businessId: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") return { error: "Only superadmins can delete businesses." };
  const admin = createAdminClient();
  const { error } = await admin.from("businesses").delete().eq("id", businessId);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { success: true };
}
