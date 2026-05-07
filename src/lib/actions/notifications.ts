"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";

export type Notification = {
  id: string;
  kind:
    | "challenge_unlocked"
    | "challenge_verified"
    | "reward_ready"
    | "merchant_status"
    | "system";
  title: string;
  body: string | null;
  icon: string | null;
  deeplink: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export async function getNotifications(): Promise<{
  data: Notification[];
  unread_count: number;
}> {
  const user = await getCurrentUser();
  if (!user) return { data: [], unread_count: 0 };

  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, icon, deeplink, metadata, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const notifications = (data ?? []) as Notification[];
  const unread_count = notifications.filter((n) => !n.read_at).length;
  return { data: notifications, unread_count };
}

export async function markNotificationsRead(ids?: string[]): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (ids && ids.length > 0) {
    query = (query as typeof query).in("id", ids);
  }

  const { error } = await query;
  return error ? { error: error.message } : {};
}
