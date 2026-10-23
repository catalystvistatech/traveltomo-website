// Server-only infrastructure. Deliberately NOT a "use server" action
// module: those may export only async functions, and this exports a const
// and types. Nothing here is callable from the client - it reads cookies()
// and the service-role client, both server-side only.
import { cache } from "react";
import { cookies } from "next/headers";
import { getCurrentUser, type UserProfile } from "@/lib/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Superadmin "act as merchant" scope.
 *
 * The operator's own session is never swapped: `auth.uid()` stays the
 * superadmin, so RLS remains a live second boundary and every row change is
 * attributable to the real human. What changes is only the TENANCY TARGET —
 * which merchant's content the merchant screens read and write.
 *
 * This is deliberately not impersonation. Minting a session as the merchant
 * would make every row, every `verified_by`, and every database log line say
 * the merchant did it; a merchant disputing an edit could not be answered.
 * Under the Data Privacy Act that is worse than holding their password.
 *
 * `getCurrentUser()` is NOT overridden. It is the identity of the human, and
 * the self-protections that depend on it (you cannot change your own role,
 * ban yourself, delete yourself), your own notification inbox, and your own
 * billing customer all key off it. Overriding it is exactly what makes
 * impersonation dangerous, and doing it here would reintroduce that.
 */

export type MerchantScope = {
  /** ALWAYS the real signed-in human. */
  actor: UserProfile;
  /** Whose content is being read/written. Equals actor.id when not acting. */
  merchantId: string;
  actingAs: null | {
    sessionId: string;
    merchantId: string;
    displayName: string | null;
    mode: "read" | "write";
    reason: string;
    expiresAt: string;
  };
};

export const ACT_AS_COOKIE = "tt_act_as";

/**
 * Resolves the acting scope for this request.
 *
 * Every check is server-side and re-run on EVERY request. The cookie carries
 * an opaque session id and nothing else — it is a lookup key, not a claim.
 * A stolen or hand-crafted cookie value grants nothing: the row must exist,
 * still be open and unexpired, belong to THIS actor, and the actor must still
 * be a superadmin as re-read from `profiles` right now. Any failure falls
 * back to "yourself", which is the fail-safe default.
 *
 * Wrapped in React `cache()` so the many call sites cost one lookup per
 * request rather than one each.
 */
export const resolveMerchantScope = cache(
  async (): Promise<MerchantScope | null> => {
    const actor = await getCurrentUser();
    if (!actor) return null;

    const self: MerchantScope = { actor, merchantId: actor.id, actingAs: null };

    // Only a superadmin can ever be acting. Checked before the cookie is even
    // read, and re-checked from profiles on every request — so demoting an
    // operator ends their act-as immediately rather than at token refresh.
    if (actor.role !== "superadmin") return self;

    const jar = await cookies();
    const sessionId = jar.get(ACT_AS_COOKIE)?.value;
    if (!sessionId) return self;

    // Service role: admin_act_as_sessions has no INSERT/UPDATE policy, and
    // reading it must not depend on the caller's own RLS view.
    const admin = createAdminClient();
    const { data: session } = await admin
      .from("admin_act_as_sessions")
      .select("id, actor_id, merchant_id, mode, reason, expires_at, ended_at")
      .eq("id", sessionId)
      .maybeSingle();

    if (
      !session ||
      session.actor_id !== actor.id ||
      session.ended_at !== null ||
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      return self;
    }

    // The target must still be a merchant. Prevents an act-as session from
    // outliving a role change on the target — and blocks the escalation
    // shape where acting as an account that later became staff would
    // otherwise inherit staff reach.
    const { data: target } = await admin
      .from("profiles")
      .select("id, role, display_name")
      .eq("id", session.merchant_id)
      .maybeSingle();

    if (!target || target.role !== "merchant") return self;

    return {
      actor,
      merchantId: session.merchant_id,
      actingAs: {
        sessionId: session.id,
        merchantId: session.merchant_id,
        displayName: target.display_name,
        mode: session.mode as "read" | "write",
        reason: session.reason,
        expiresAt: session.expires_at,
      },
    };
  }
);

/**
 * True when the caller may WRITE to the scoped merchant's content.
 *
 * A read-only act-as session is for support triage and must never mutate.
 * When not acting, the caller writes their own content as usual.
 */
export function scopeAllowsWrite(scope: MerchantScope): boolean {
  if (!scope.actingAs) return true;
  return scope.actingAs.mode === "write";
}
