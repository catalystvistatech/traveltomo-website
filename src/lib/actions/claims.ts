"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";

// All actions here are read-only history / analytics queries scoped to
// the calling merchant. RLS on `challenge_completions` and `challenges`
// already restricts what each role can see, but we additionally filter
// by `challenges.merchant_id` so an admin viewing as themselves still
// scopes to their own challenges when they own any. Admins/superadmins
// browsing other merchants happens via the `/admin/manage/*` surfaces.

export type ClaimStatus = "pending" | "verified" | "rejected";

export type ClaimRow = {
  id: string;
  verification_status: ClaimStatus;
  verification_code: string | null;
  completed_at: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  reward_released: boolean;
  proof_url: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  challenge: {
    id: string;
    title: string;
    xp_reward: number | null;
  } | null;
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  reward: {
    title: string | null;
    description: string | null;
    discount_type: string | null;
    discount_value: number | null;
  } | null;
};

export interface ClaimListFilters {
  status?: ClaimStatus | "all";
  challengeId?: string;
  from?: string; // ISO date (yyyy-mm-dd) inclusive
  to?: string;   // ISO date (yyyy-mm-dd) inclusive
  limit?: number;
  offset?: number;
}

export interface ClaimListResult {
  rows: ClaimRow[];
  total: number;
  challenges: { id: string; title: string }[];
}

/**
 * Paginated claim-history feed for the calling merchant. Anything with
 * `completed_at IS NOT NULL` qualifies (the traveler has submitted proof
 * and a code has been issued). Admins viewing this page see only the
 * challenges they personally own; cross-merchant browsing belongs in the
 * admin surfaces under `/admin/manage`.
 */
export async function listMerchantClaims(
  filters: ClaimListFilters = {}
): Promise<ClaimListResult> {
  const user = await getCurrentUser();
  if (!user) return { rows: [], total: 0, challenges: [] };
  const supabase = await createClient();

  // Resolve the merchant's challenge ids. Doing this up-front lets us
  // bail out cheaply when the merchant hasn't created anything yet and
  // also gives the filter dropdown its option list.
  const { data: challenges } = await supabase
    .from("challenges")
    .select("id, title")
    .eq("merchant_id", user.id)
    .order("title", { ascending: true });
  const challengeOptions = (challenges ?? []).map((c) => ({
    id: c.id as string,
    title: (c.title as string) ?? "Challenge",
  }));
  const challengeIds = challengeOptions.map((c) => c.id);
  if (challengeIds.length === 0) {
    return { rows: [], total: 0, challenges: [] };
  }

  const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
  const offset = Math.max(0, filters.offset ?? 0);
  const wantedIds =
    filters.challengeId && challengeIds.includes(filters.challengeId)
      ? [filters.challengeId]
      : challengeIds;

  let query = supabase
    .from("challenge_completions")
    .select(
      `id, verification_status, verification_code, completed_at, verified_at,
       rejection_reason, reward_released, proof_url, gps_latitude, gps_longitude,
       challenge:challenges!inner ( id, title, merchant_id, xp_reward,
         rewards ( title, description, discount_type, discount_value )
       ),
       user:profiles!challenge_completions_user_id_fkey ( id, display_name, avatar_url )
      `,
      { count: "exact" }
    )
    .in("challenge_id", wantedIds)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.status && filters.status !== "all") {
    query = query.eq("verification_status", filters.status);
  }
  if (filters.from) {
    query = query.gte("completed_at", `${filters.from}T00:00:00Z`);
  }
  if (filters.to) {
    query = query.lte("completed_at", `${filters.to}T23:59:59Z`);
  }

  const { data, count, error } = await query;
  if (error) {
    return { rows: [], total: 0, challenges: challengeOptions };
  }

  type RawRow = {
    id: string;
    verification_status: ClaimStatus;
    verification_code: string | null;
    completed_at: string | null;
    verified_at: string | null;
    rejection_reason: string | null;
    reward_released: boolean | null;
    proof_url: string | null;
    gps_latitude: number | null;
    gps_longitude: number | null;
    challenge: {
      id: string;
      title: string;
      merchant_id: string | null;
      xp_reward: number | null;
      rewards:
        | Array<{
            title: string | null;
            description: string | null;
            discount_type: string | null;
            discount_value: number | null;
          }>
        | null;
    } | null;
    user: {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
  };

  const rows: ClaimRow[] = (
    (data ?? []) as unknown as RawRow[]
  ).map((row) => ({
    id: row.id,
    verification_status: row.verification_status,
    verification_code: row.verification_code,
    completed_at: row.completed_at,
    verified_at: row.verified_at,
    rejection_reason: row.rejection_reason,
    reward_released: row.reward_released ?? false,
    proof_url: row.proof_url,
    gps_latitude: row.gps_latitude,
    gps_longitude: row.gps_longitude,
    challenge: row.challenge
      ? {
          id: row.challenge.id,
          title: row.challenge.title,
          xp_reward: row.challenge.xp_reward,
        }
      : null,
    user: row.user
      ? {
          id: row.user.id,
          display_name: row.user.display_name,
          avatar_url: row.user.avatar_url,
        }
      : null,
    reward: row.challenge?.rewards?.[0]
      ? {
          title: row.challenge.rewards[0].title,
          description: row.challenge.rewards[0].description,
          discount_type: row.challenge.rewards[0].discount_type,
          discount_value: row.challenge.rewards[0].discount_value,
        }
      : null,
  }));

  return {
    rows,
    total: count ?? rows.length,
    challenges: challengeOptions,
  };
}

// ---------------------------------------------------------------------
// Analytics summary
// ---------------------------------------------------------------------

export interface ClaimAnalytics {
  totals: {
    completions: number;
    pending: number;
    verified: number;
    rejected: number;
    redemptions: number;
    conversionRate: string;
  };
  daily: { date: string; pending: number; verified: number; rejected: number }[];
  topChallenges: {
    challengeId: string;
    title: string;
    completions: number;
    verified: number;
    pending: number;
    rejected: number;
  }[];
  topCustomers: {
    userId: string;
    displayName: string;
    completions: number;
    verified: number;
  }[];
}

/**
 * Roll-up analytics for the calling merchant covering the last `days`
 * days of activity. Everything is computed in-process from a single
 * fetch so the page renders in one round-trip; if/when volume grows
 * this should move into a Postgres view.
 */
export async function getMerchantClaimAnalytics(
  days: number = 30
): Promise<ClaimAnalytics> {
  const empty: ClaimAnalytics = {
    totals: {
      completions: 0,
      pending: 0,
      verified: 0,
      rejected: 0,
      redemptions: 0,
      conversionRate: "0%",
    },
    daily: [],
    topChallenges: [],
    topCustomers: [],
  };

  const user = await getCurrentUser();
  if (!user) return empty;
  const supabase = await createClient();

  const { data: challenges } = await supabase
    .from("challenges")
    .select("id, title")
    .eq("merchant_id", user.id);

  const challengeMap = new Map<string, string>();
  for (const c of challenges ?? []) {
    challengeMap.set(c.id as string, (c.title as string) ?? "Challenge");
  }
  const challengeIds = Array.from(challengeMap.keys());
  if (challengeIds.length === 0) return empty;

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - (days - 1));
  sinceDate.setHours(0, 0, 0, 0);
  const sinceIso = sinceDate.toISOString();

  const [completionsResult, rewardsResult, redemptionsResult] =
    await Promise.all([
      supabase
        .from("challenge_completions")
        .select(
          `id, challenge_id, user_id, verification_status, completed_at,
           user:profiles!challenge_completions_user_id_fkey(display_name)`
        )
        .in("challenge_id", challengeIds)
        .not("completed_at", "is", null)
        .gte("completed_at", sinceIso),
      supabase
        .from("rewards")
        .select("id, merchant_id")
        .eq("merchant_id", user.id),
      Promise.resolve({ count: 0 as number | null }),
    ]);

  type CompletionRow = {
    id: string;
    challenge_id: string;
    user_id: string;
    verification_status: ClaimStatus;
    completed_at: string | null;
    user: { display_name: string | null } | null;
  };
  const completions: CompletionRow[] =
    (completionsResult.data as CompletionRow[] | null) ?? [];

  const rewardIds = ((rewardsResult.data ?? []) as Record<string, unknown>[]).map(
    (r) => r.id as string
  );

  // Redemption count is independent of the date window so merchants get
  // a stable conversion benchmark instead of a number that bounces with
  // the slider.
  let redemptionCount = 0;
  if (rewardIds.length > 0) {
    const { count } = await supabase
      .from("reward_redemptions")
      .select("id", { count: "exact", head: true })
      .in("reward_id", rewardIds);
    redemptionCount = count ?? 0;
  }
  redemptionsResult.count = redemptionCount;

  const totals = {
    completions: completions.length,
    pending: 0,
    verified: 0,
    rejected: 0,
    redemptions: redemptionCount,
    conversionRate: "0%",
  };

  for (const row of completions) {
    if (row.verification_status === "pending") totals.pending += 1;
    else if (row.verification_status === "verified") totals.verified += 1;
    else if (row.verification_status === "rejected") totals.rejected += 1;
  }
  totals.conversionRate =
    totals.completions > 0
      ? `${Math.round((totals.verified / totals.completions) * 100)}%`
      : "0%";

  // Daily buckets, oldest -> newest so the chart reads left to right.
  const daily: ClaimAnalytics["daily"] = [];
  const dayMap = new Map<
    string,
    { pending: number; verified: number; rejected: number }
  >();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(sinceDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { pending: 0, verified: 0, rejected: 0 });
  }
  for (const row of completions) {
    if (!row.completed_at) continue;
    const key = row.completed_at.slice(0, 10);
    const bucket = dayMap.get(key);
    if (!bucket) continue;
    if (row.verification_status === "pending") bucket.pending += 1;
    else if (row.verification_status === "verified") bucket.verified += 1;
    else if (row.verification_status === "rejected") bucket.rejected += 1;
  }
  for (const [date, counts] of dayMap.entries()) {
    daily.push({ date, ...counts });
  }

  // Per-challenge breakdown.
  const perChallenge = new Map<
    string,
    {
      challengeId: string;
      title: string;
      completions: number;
      verified: number;
      pending: number;
      rejected: number;
    }
  >();
  for (const row of completions) {
    const id = row.challenge_id;
    const bucket =
      perChallenge.get(id) ?? {
        challengeId: id,
        title: challengeMap.get(id) ?? "Challenge",
        completions: 0,
        verified: 0,
        pending: 0,
        rejected: 0,
      };
    bucket.completions += 1;
    if (row.verification_status === "pending") bucket.pending += 1;
    else if (row.verification_status === "verified") bucket.verified += 1;
    else if (row.verification_status === "rejected") bucket.rejected += 1;
    perChallenge.set(id, bucket);
  }
  const topChallenges = Array.from(perChallenge.values())
    .sort((a, b) => b.completions - a.completions)
    .slice(0, 5);

  // Per-customer breakdown - useful for spotting power users.
  const perCustomer = new Map<
    string,
    {
      userId: string;
      displayName: string;
      completions: number;
      verified: number;
    }
  >();
  for (const row of completions) {
    if (!row.user_id) continue;
    const bucket =
      perCustomer.get(row.user_id) ?? {
        userId: row.user_id,
        displayName: row.user?.display_name ?? "Traveler",
        completions: 0,
        verified: 0,
      };
    bucket.completions += 1;
    if (row.verification_status === "verified") bucket.verified += 1;
    perCustomer.set(row.user_id, bucket);
  }
  const topCustomers = Array.from(perCustomer.values())
    .sort((a, b) => b.completions - a.completions)
    .slice(0, 5);

  return { totals, daily, topChallenges, topCustomers };
}
