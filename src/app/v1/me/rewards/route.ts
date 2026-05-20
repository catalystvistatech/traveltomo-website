import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

/**
 * GET /v1/me/rewards?limit=50&status=pending|verified|rejected
 *
 * Returns the caller's challenge completions where the user has already
 * submitted proof (`completed_at IS NOT NULL`) together with the merchant
 * challenge title, business name, verification code, and reward details.
 *
 * Used by the iOS "My Rewards" screen so travelers can see:
 *   - pending completions awaiting merchant verification (show the code),
 *   - verified completions that have been redeemed (claimed),
 *   - rejected completions with the merchant's reason.
 *
 * All filtering is by `user_id = auth.uid()` via RLS - this endpoint
 * never trusts a client-provided id.
 */
export async function GET(request: Request) {
  const { user, client, error } = await requireUser(request);
  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 50), 200));
  const statusParam = url.searchParams.get("status");
  const allowedStatuses = new Set(["pending", "verified", "rejected"]);
  const status = statusParam && allowedStatuses.has(statusParam) ? statusParam : null;

  // `challenges` does not have a direct FK to `businesses` (its only
  // owner reference is `merchant_id -> profiles.id`), so PostgREST
  // cannot embed `business:businesses(...)` here. We resolve the
  // business via `businesses.merchant_id` in a second query and merge
  // it in below.
  let query = client
    .from("challenge_completions")
    .select(
      `id, verification_status, verification_code, completed_at, verified_at,
       rejection_reason, reward_released, proof_url,
       challenge:challenges!inner (
         id, title, merchant_id, xp_reward,
         rewards ( id, title, description, discount_type, discount_value )
       )`
    )
    .eq("user_id", user.id)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("verification_status", status);

  const { data, error: listError } = await query;
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  type Row = NonNullable<typeof data>[number] & {
    challenge?: {
      id: string;
      title: string;
      merchant_id: string | null;
      xp_reward: number | null;
      rewards:
        | Array<{
            id: string;
            title: string;
            description: string | null;
            discount_type: string;
            discount_value: number | null;
          }>
        | null;
    } | null;
  };

  const rows = (data ?? []) as Row[];

  // Resolve `merchant_id -> businesses` in a single follow-up query.
  // Most travelers only have a handful of distinct merchants in their
  // history so this stays a small `IN (?)` lookup.
  const merchantIds = Array.from(
    new Set(
      rows
        .map((row) => row.challenge?.merchant_id)
        .filter((id): id is string => typeof id === "string")
    )
  );

  type BusinessRow = { id: string; merchant_id: string; name: string; city: string | null };
  let businessesByMerchant = new Map<string, BusinessRow>();
  if (merchantIds.length > 0) {
    const { data: businessRows, error: businessError } = await client
      .from("businesses")
      .select("id, merchant_id, name, city")
      .in("merchant_id", merchantIds);
    if (businessError) {
      return NextResponse.json({ error: businessError.message }, { status: 500 });
    }
    businessesByMerchant = new Map(
      (businessRows ?? []).map((b) => [b.merchant_id, b as BusinessRow])
    );
  }

  const result = rows.map((row) => {
    const reward = row.challenge?.rewards?.[0] ?? null;
    const business = row.challenge?.merchant_id
      ? businessesByMerchant.get(row.challenge.merchant_id) ?? null
      : null;
    return {
      id: row.id,
      verification_status: row.verification_status,
      verification_code: row.verification_code,
      completed_at: row.completed_at,
      verified_at: row.verified_at,
      rejection_reason: row.rejection_reason,
      reward_released: row.reward_released,
      challenge: row.challenge
        ? {
            id: row.challenge.id,
            title: row.challenge.title,
            xp_reward: row.challenge.xp_reward,
            business_name: business?.name ?? null,
            business_city: business?.city ?? null,
          }
        : null,
      reward: reward
        ? {
            id: reward.id,
            title: reward.title,
            description: reward.description,
            discount_type: reward.discount_type,
            discount_value: reward.discount_value,
          }
        : null,
    };
  });

  const counts = rows.reduce(
    (acc, row) => {
      const s = row.verification_status ?? "pending";
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return NextResponse.json({
    data: result,
    counts: {
      pending: counts.pending ?? 0,
      verified: counts.verified ?? 0,
      rejected: counts.rejected ?? 0,
    },
  });
}
