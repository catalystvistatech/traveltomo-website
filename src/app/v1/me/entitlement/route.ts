import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAppStoreTransaction } from "@/lib/payments/appStore";

export const dynamic = "force-dynamic";

const BUNDLE_ID = "com.cvt.TravelTomo";
const UNLIMITED_PRODUCT_IDS = new Set([
  "com.cvt.traveltomo.unlimited.yearly",
  "com.cvt.traveltomo.unlimited.monthly",
]);
// TestFlight / sandbox purchases are real Apple-signed transactions too.
const ALLOWED_ENVIRONMENTS = new Set(["Production", "Sandbox"]);

/**
 * POST /v1/me/entitlement — mirrors the caller's App Store Unlimited Pass
 * into `profiles.is_unlimited` (unlimited skips, no ads).
 *
 * Body:
 *   { unlimited: true,  signedTransaction: "<StoreKit 2 JWS>" }
 *   { unlimited: false }
 *
 * Granting requires proof: the StoreKit 2 signed transaction for the
 * current entitlement, verified server-side against Apple's root CA
 * (src/lib/payments/appStore.ts). It must be for this app and an Unlimited
 * product, not revoked, not expired, and belong to this account (its
 * appAccountToken is the user id; older purchases without one are bound
 * to the first account that claims them). The previous version trusted a
 * bare `{ unlimited: true }`, so anyone could grant themselves the pass.
 *
 * Revoking needs no proof, but only clears a pass that came from the App
 * Store — never one granted by a Stripe subscription.
 */
export async function POST(request: Request) {
  const { user, error } = await requireUser(request);
  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { unlimited?: unknown; signedTransaction?: unknown }
    | null;
  if (!body || typeof body.unlimited !== "boolean") {
    return NextResponse.json({ error: "unlimited (boolean) is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (!body.unlimited) {
    const { error: updateError } = await admin
      .from("profiles")
      .update({ is_unlimited: false, unlimited_status: "none", unlimited_renews_at: null })
      .eq("id", user.id)
      .or("unlimited_source.is.null,unlimited_source.eq.storekit");
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ data: { ok: true, unlimited: false } });
  }

  if (typeof body.signedTransaction !== "string" || body.signedTransaction.length < 20) {
    return NextResponse.json({ error: "signed_transaction_required" }, { status: 400 });
  }

  const verified = verifyAppStoreTransaction(body.signedTransaction);
  if (!verified.ok) {
    console.warn("entitlement: rejected App Store transaction", verified.reason);
    return NextResponse.json({ error: "invalid_transaction", reason: verified.reason }, { status: 403 });
  }
  const tx = verified.transaction;
  const now = Date.now();

  const problem =
    tx.bundleId !== BUNDLE_ID
      ? "wrong_app"
      : !UNLIMITED_PRODUCT_IDS.has(tx.productId)
        ? "wrong_product"
        : tx.environment && !ALLOWED_ENVIRONMENTS.has(tx.environment)
          ? "wrong_environment"
          : tx.revocationDate
            ? "revoked"
            : typeof tx.expiresDate !== "number" || tx.expiresDate <= now
              ? "expired"
              : tx.appAccountToken && tx.appAccountToken.toLowerCase() !== user.id.toLowerCase()
                ? "other_account"
                : null;
  if (problem) {
    return NextResponse.json({ error: "invalid_transaction", reason: problem }, { status: 403 });
  }

  // One App Store subscription unlocks one TravelTomo account. The unique
  // index on apple_original_transaction_id enforces this; check first for a
  // clear error instead of a constraint violation.
  const { data: holder } = await admin
    .from("profiles")
    .select("id")
    .eq("apple_original_transaction_id", tx.originalTransactionId)
    .neq("id", user.id)
    .maybeSingle();
  if (holder) {
    return NextResponse.json({ error: "invalid_transaction", reason: "other_account" }, { status: 409 });
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      is_unlimited: true,
      unlimited_status: "active",
      unlimited_renews_at: new Date(tx.expiresDate as number).toISOString(),
      unlimited_source: "storekit",
      apple_original_transaction_id: tx.originalTransactionId,
    })
    .eq("id", user.id);
  if (updateError) {
    const status = updateError.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: updateError.message }, { status });
  }

  return NextResponse.json({ data: { ok: true, unlimited: true } });
}
