"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitNotification } from "@/lib/notifications/emit";
import {
  ACT_AS_COOKIE,
  resolveMerchantScope,
  type MerchantScope,
} from "@/lib/actions/scope";

/**
 * Opening, closing and auditing a superadmin "act as merchant" session.
 *
 * Policy implemented here: act freely, but state a reason, and tell the
 * merchant afterwards. The alternative — requiring the merchant to grant
 * access first — cannot serve the case this exists for: a merchant who has
 * gone unresponsive and asked for help before going quiet.
 */

/** Absolute clock. An act-as session should not outlive the task. */
const SESSION_TTL_MINUTES = 60;
const MIN_REASON_LENGTH = 10;

export async function listActAsMerchants() {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "superadmin") return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, display_name, email")
    .eq("role", "merchant")
    .order("display_name");
  return data ?? [];
}

export async function startActAs(
  merchantId: string,
  reason: string,
  mode: "read" | "write" = "write"
) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "superadmin") {
    return { error: "Only superadmins can act as a merchant." };
  }
  // v1 is write-only. The schema carries `mode` so a read-only support-triage
  // tier can be added later, but every quest action would first need to
  // consult `canWrite` — until it does, accepting mode='read' would hand out
  // a guarantee nothing enforces. Refuse rather than pretend.
  if (mode !== "write") {
    return { error: "Read-only act-as is not available yet." };
  }
  if (merchantId === actor.id) {
    return { error: "You are already yourself." };
  }
  const trimmed = reason.trim();
  if (trimmed.length < MIN_REASON_LENGTH) {
    return {
      error: `Please describe why you need access (at least ${MIN_REASON_LENGTH} characters). This is shown to the merchant.`,
    };
  }

  const admin = createAdminClient();

  // The target must be a merchant. Acting as staff would be an escalation
  // path, not a support tool.
  const { data: target } = await admin
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", merchantId)
    .maybeSingle();
  if (!target || target.role !== "merchant") {
    return { error: "That account is not a merchant." };
  }

  // One live session per actor: close any earlier one so an abandoned
  // session cannot linger behind a new one.
  await admin
    .from("admin_act_as_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("actor_id", actor.id)
    .is("ended_at", null);

  const expiresAt = new Date(
    Date.now() + SESSION_TTL_MINUTES * 60_000
  ).toISOString();

  const { data: session, error } = await admin
    .from("admin_act_as_sessions")
    .insert({
      actor_id: actor.id,
      merchant_id: merchantId,
      reason: trimmed,
      mode,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !session) {
    return { error: error?.message ?? "Could not start the session." };
  }

  // The cookie carries only the opaque id; every check is re-run server-side
  // on each request. httpOnly so page scripts cannot read or forge it.
  const jar = await cookies();
  jar.set(ACT_AS_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MINUTES * 60,
  });

  revalidatePath("/admin", "layout");
  return { success: true, merchantName: target.display_name };
}

export async function stopActAs() {
  const actor = await getCurrentUser();
  const jar = await cookies();
  const sessionId = jar.get(ACT_AS_COOKIE)?.value;
  jar.delete(ACT_AS_COOKIE);

  if (actor && sessionId) {
    const admin = createAdminClient();
    // Summarize on the way out, so the merchant gets a count rather than a
    // notification per edit.
    const { data: session } = await admin
      .from("admin_act_as_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("actor_id", actor.id)
      .is("ended_at", null)
      .select("id, merchant_id, reason, notified_at")
      .maybeSingle();

    if (session?.notified_at) {
      const { count } = await admin
        .from("admin_act_as_audit")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id);
      if ((count ?? 0) > 0) {
        await emitNotification({
          userId: session.merchant_id,
          kind: "system",
          title: "Administrator finished editing your quests",
          body: `${count} change${count === 1 ? "" : "s"} were made. Reason: ${session.reason}`,
          icon: "checkmark.shield.fill",
          metadata: { act_as_session_id: session.id, changes: count },
        });
      }
    }
  }

  revalidatePath("/admin", "layout");
  return { success: true };
}

/**
 * Records one change made while acting as a merchant, and notifies the
 * merchant the first time a session writes anything.
 *
 * Never throws: an audit failure must not corrupt the caller's result. It is
 * logged loudly instead, and the append-only trigger on the table means a
 * recorded entry can never be quietly rewritten later.
 */
export async function recordActAsChange(
  scope: MerchantScope,
  entry: {
    action: string;
    entityType?: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  }
) {
  if (!scope.actingAs) return;
  try {
    const admin = createAdminClient();
    await admin.from("admin_act_as_audit").insert({
      session_id: scope.actingAs.sessionId,
      actor_id: scope.actor.id,
      actor_email: scope.actor.email,
      merchant_id: scope.merchantId,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });

    // First write of this session -> tell the merchant once.
    const { data: session } = await admin
      .from("admin_act_as_sessions")
      .select("id, notified_at, reason")
      .eq("id", scope.actingAs.sessionId)
      .maybeSingle();

    if (session && !session.notified_at) {
      await admin
        .from("admin_act_as_sessions")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", session.id);

      await emitNotification({
        userId: scope.merchantId,
        kind: "system",
        title: "A Travel Tomo administrator is editing your quests",
        body: `Reason: ${session.reason}. You can review every change in your account.`,
        icon: "person.badge.shield.checkmark.fill",
        metadata: { act_as_session_id: session.id },
      });
    }
  } catch (e) {
    console.error("[act-as] audit write failed", e);
  }
}

export async function getActAsScope(): Promise<MerchantScope | null> {
  return resolveMerchantScope();
}
