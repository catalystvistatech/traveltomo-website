"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { revalidatePath } from "next/cache";

export type UserRole = "user" | "merchant" | "admin" | "superadmin";

export interface ManagedUser {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  merchant_request_status: string;
  banned_at: string | null;
  ban_reason: string | null;
  xp: number;
  created_at: string;
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function listUsers({
  search = "",
  role = "",
  page = 1,
  pageSize = 20,
}: {
  search?: string;
  role?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ users: ManagedUser[]; total: number }> {
  await requireAdmin();
  const admin = createAdminClient();

  let query = admin
    .from("profiles")
    .select(
      "id, email, display_name, avatar_url, role, merchant_request_status, banned_at, ban_reason, xp, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (role) {
    query = query.eq("role", role);
  }

  if (search.trim()) {
    query = query.or(
      `email.ilike.%${search.trim()}%,display_name.ilike.%${search.trim()}%`
    );
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return { users: (data ?? []) as ManagedUser[], total: count ?? 0 };
}

export async function updateUserRole(userId: string, role: UserRole) {
  const me = await requireAdmin();

  // Only superadmins can promote to admin/superadmin
  if (
    (role === "admin" || role === "superadmin") &&
    me.role !== "superadmin"
  ) {
    return { error: "Only superadmins can promote to admin roles" };
  }

  // Prevent demoting yourself
  if (userId === me.id) {
    return { error: "You cannot change your own role" };
  }

  const admin = createAdminClient();

  // Update profiles table
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (profileError) return { error: profileError.message };

  // Sync role into auth.users app_metadata so JWTs reflect the change
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  });

  if (authError) return { error: authError.message };

  revalidatePath("/admin/manage/users");
  return { success: true };
}

export async function banUser(userId: string, reason: string) {
  const me = await requireAdmin();

  if (userId === me.id) {
    return { error: "You cannot ban yourself" };
  }

  const admin = createAdminClient();

  // Check target user's role -- admins cannot ban other admins/superadmins
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (
    target &&
    (target.role === "admin" || target.role === "superadmin") &&
    me.role !== "superadmin"
  ) {
    return { error: "Only superadmins can ban admins" };
  }

  // Mark banned in profiles
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      banned_at: new Date().toISOString(),
      banned_by: me.id,
      ban_reason: reason || "Banned by admin",
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileError) return { error: profileError.message };

  // Use Supabase auth ban to invalidate active sessions immediately
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h", // 100 years
  });

  if (authError) return { error: authError.message };

  revalidatePath("/admin/manage/users");
  return { success: true };
}

export async function unbanUser(userId: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      banned_at: null,
      banned_by: null,
      ban_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileError) return { error: profileError.message };

  // Lift auth-level ban
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });

  if (authError) return { error: authError.message };

  revalidatePath("/admin/manage/users");
  return { success: true };
}

export async function deleteUser(userId: string) {
  const me = await requireAdmin();

  if (userId === me.id) {
    return { error: "You cannot delete your own account" };
  }

  // Only superadmins can delete users
  if (me.role !== "superadmin") {
    return { error: "Only superadmins can delete users" };
  }

  const admin = createAdminClient();

  // Check target isn't also a superadmin
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (target?.role === "superadmin") {
    return { error: "Cannot delete another superadmin" };
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/manage/users");
  return { success: true };
}
