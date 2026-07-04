import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /v1/me/entitlement - mirrors the caller's StoreKit subscription
 * entitlement into `profiles.is_unlimited`.
 *
 * The iOS app calls this after StoreKit 2 verifies a purchase / restore /
 * revocation (Transaction.currentEntitlements), so server features that
 * honor the Unlimited pass (unlimited quest skips, no-ads) work without
 * the app re-checking StoreKit on every request. StoreKit's on-device
 * cryptographic verification is the trust anchor for the MVP; App Store
 * Server Notifications can harden this later without changing the shape.
 *
 * Body: { unlimited: boolean, source?: string }
 */
export async function POST(request: Request) {
  const { user, error } = await requireUser(request);
  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { unlimited?: unknown; source?: unknown }
    | null;
  if (!body || typeof body.unlimited !== "boolean") {
    return NextResponse.json(
      { error: "unlimited (boolean) is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      is_unlimited: body.unlimited,
      unlimited_status: body.unlimited ? "active" : "none",
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ data: { ok: true, unlimited: body.unlimited } });
}
