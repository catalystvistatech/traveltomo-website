"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitNotification } from "@/lib/notifications/emit";
import { revalidatePath } from "next/cache";

export type UserRole = "user" | "merchant" | "admin" | "superadmin";
export type MerchantRequestStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";

export type UserProfile = {
  id: string;
  role: UserRole;
  merchant_request_status: MerchantRequestStatus;
  display_name: string | null;
  avatar_url: string | null;
  email: string;
};

function isAdminRole(role: UserRole) {
  return role === "admin" || role === "superadmin";
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, merchant_request_status, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    ...profile,
    email: user.email ?? "",
  } as UserProfile;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/**
 * Let a regular user flag their profile as wanting to become a merchant so
 * admins can pick up the request from `/admin/manage/merchants`.
 */
export async function requestMerchantAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ merchant_request_status: "pending" })
    .eq("id", user.id)
    .eq("merchant_request_status", "none");

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: true };
}

export async function getRoleManagementData() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isAdminRole(currentUser.role)) {
    return { error: "Unauthorized", data: [] as Record<string, unknown>[] };
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("profiles")
    .select(
      "id, role, merchant_request_status, display_name, avatar_url, created_at, businesses(id,name,city,category,is_verified)"
    )
    .order("created_at", { ascending: false });

  if (error) return { error: error.message, data: [] as Record<string, unknown>[] };
  return { data: (data ?? []) as Record<string, unknown>[] };
}

export async function updateUserRole(targetUserId: string, role: UserRole) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "superadmin") {
    return { error: "Only superadmins can change user roles." };
  }

  const adminClient = createAdminClient();
  const updatePayload: Record<string, unknown> = { role };
  if (role === "merchant") {
    updatePayload.merchant_request_status = "approved";
  } else if (role !== "admin" && role !== "superadmin") {
    updatePayload.merchant_request_status = "none";
  }

  const { error } = await adminClient
    .from("profiles")
    .update(updatePayload)
    .eq("id", targetUserId);

  if (error) return { error: error.message };

  if (role === "merchant") {
    await emitNotification({
      userId: targetUserId,
      kind: "merchant_status",
      title: "You're a merchant!",
      body: "Your account has been upgraded. You can now create challenges.",
      icon: "person.badge.shield.checkmark.fill",
      metadata: { role },
    });
  }

  revalidatePath("/admin/manage/merchants");
  return { success: true };
}

export async function reviewMerchantRequest(
  targetUserId: string,
  decision: "approved" | "rejected" | "suspended"
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isAdminRole(currentUser.role)) {
    return { error: "Only admins/superadmins can review merchant requests." };
  }

  const adminClient = createAdminClient();
  const updatePayload: Record<string, unknown> = {
    merchant_request_status: decision,
  };

  if (decision === "approved") {
    updatePayload.role = "merchant";
  } else {
    updatePayload.role = "user";
  }

  const { error } = await adminClient
    .from("profiles")
    .update(updatePayload)
    .eq("id", targetUserId);

  if (error) return { error: error.message };

  const notificationCopy =
    decision === "approved"
      ? {
          title: "Merchant request approved",
          body: "You've been granted merchant access. Start creating challenges.",
          icon: "person.badge.shield.checkmark.fill",
        }
      : decision === "rejected"
        ? {
            title: "Merchant request rejected",
            body: "Your merchant request was not approved. Contact support for details.",
            icon: "xmark.seal.fill",
          }
        : {
            title: "Merchant access suspended",
            body: "Your merchant access has been suspended.",
            icon: "exclamationmark.shield.fill",
          };

  await emitNotification({
    userId: targetUserId,
    kind: "merchant_status",
    ...notificationCopy,
    metadata: { decision },
  });

  revalidatePath("/admin/manage/merchants");
  return { success: true };
}
