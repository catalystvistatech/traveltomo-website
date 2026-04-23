import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationKind =
  | "challenge_unlocked"
  | "challenge_verified"
  | "reward_ready"
  | "merchant_status"
  | "system";

export type EmitNotificationInput = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  icon?: string;
  deeplink?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Inserts a notification row using the service role so it bypasses RLS.
 * Safe to call from server actions / API routes. Failures are swallowed
 * and logged so caller business logic never breaks because of a failed
 * notification write.
 */
export async function emitNotification(input: EmitNotificationInput) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("notifications").insert({
      user_id: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      icon: input.icon ?? null,
      deeplink: input.deeplink ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.error("[notifications] insert failed", error.message);
    }
  } catch (error) {
    console.error("[notifications] insert threw", error);
  }
}
