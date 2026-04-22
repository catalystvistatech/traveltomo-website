"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";

export type RecommendationStatus = {
  isMerchant: boolean;
  businessVerified: boolean;
  businessVerificationStatus: string | null;
  hasLocation: boolean;
  hasHours: boolean;
  isOpenNow: boolean;
  hasActivePromotion: boolean;
  liveTravelChallenges: number;
  isRecommendable: boolean;
  blockers: string[];
};

/**
 * Summarises whether the current merchant is currently visible to travelers.
 * Backs the "Recommendation Status" card on the dashboard home.
 */
export async function getRecommendationStatus(): Promise<RecommendationStatus> {
  const empty: RecommendationStatus = {
    isMerchant: false,
    businessVerified: false,
    businessVerificationStatus: null,
    hasLocation: false,
    hasHours: false,
    isOpenNow: false,
    hasActivePromotion: false,
    liveTravelChallenges: 0,
    isRecommendable: false,
    blockers: [],
  };

  const user = await getCurrentUser();
  if (!user) return empty;
  if (user.role !== "merchant" && user.role !== "admin" && user.role !== "superadmin") {
    return empty;
  }

  const supabase = await createClient();
  const { data: biz } = await supabase
    .from("businesses")
    .select(
      "id, verification_status, latitude, longitude, hours, service_radius_meters, timezone"
    )
    .eq("merchant_id", user.id)
    .maybeSingle();

  const businessVerified = biz?.verification_status === "approved";
  const businessVerificationStatus =
    (biz?.verification_status as string | null) ?? null;
  const hasLocation = !!biz?.latitude && !!biz?.longitude;
  const hasHours =
    !!biz?.hours && typeof biz.hours === "object" && Object.keys(biz.hours as Record<string, unknown>).length > 0;

  let isOpenNow = false;
  if (biz?.id) {
    const { data: openResult } = await supabase.rpc("merchant_is_open_now", {
      p_business_id: biz.id,
    });
    isOpenNow = !!openResult;
  }

  const { data: promo } = await supabase.rpc("merchant_has_active_promotion", {
    p_merchant: user.id,
  });
  const hasActivePromotion = !!promo;

  const { count: liveCountRaw } = await supabase
    .from("travel_challenges")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", user.id)
    .eq("status", "live");
  const liveTravelChallenges = liveCountRaw ?? 0;

  const blockers: string[] = [];
  if (!businessVerified) blockers.push("Business not verified by an admin yet");
  if (!hasLocation) blockers.push("Business location not set");
  if (!hasHours) blockers.push("Operating hours not configured");
  if (!isOpenNow) blockers.push("Currently outside your operating hours");
  if (!hasActivePromotion) blockers.push("No active promotion subscription");
  if (liveTravelChallenges === 0) blockers.push("No live travel challenges yet");

  const isRecommendable =
    businessVerified && hasLocation && hasHours && isOpenNow && hasActivePromotion && liveTravelChallenges > 0;

  return {
    isMerchant: true,
    businessVerified,
    businessVerificationStatus,
    hasLocation,
    hasHours,
    isOpenNow,
    hasActivePromotion,
    liveTravelChallenges,
    isRecommendable,
    blockers,
  };
}

/**
 * Admin-side counts for the dashboard home.
 */
export async function getAdminOverview() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return null;
  }

  const supabase = await createClient();

  const [businessesPending, travelPending, merchantsTotal, subsActive] =
    await Promise.all([
      supabase
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .in("verification_status", ["pending", "unsubmitted"]),
      supabase
        .from("travel_challenges")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_review"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "merchant"),
      supabase
        .from("merchant_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gte("ends_at", new Date().toISOString()),
    ]);

  return {
    businessesPending: businessesPending.count ?? 0,
    travelChallengesPending: travelPending.count ?? 0,
    merchantsTotal: merchantsTotal.count ?? 0,
    subscriptionsActive: subsActive.count ?? 0,
  };
}

/**
 * Merchant-facing list of their travel challenges pending / live etc.
 */
export async function getTravelChallengeSummary() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("travel_challenges")
    .select("status")
    .eq("merchant_id", user.id);
  const rows = data ?? [];
  return {
    draft: rows.filter((r) => r.status === "draft").length,
    pending: rows.filter((r) => r.status === "pending_review").length,
    live: rows.filter((r) => r.status === "live").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };
}
