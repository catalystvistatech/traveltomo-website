"use server";

import { isQuestPlayable, manilaToday, questState, type QuestWindow } from "@/lib/quest-window";

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

  // With multi-business support, prefer the approved business; fall back
  // to the first one so the status card still shows useful info.
  const { data: bizRows } = await supabase
    .from("businesses")
    .select("id, verification_status, latitude, longitude, hours, service_radius_meters, timezone")
    .eq("merchant_id", user.id)
    .order("created_at", { ascending: true });

  const allBiz = bizRows ?? [];
  const biz = allBiz.find((b) => b.verification_status === "approved") ?? allBiz[0] ?? null;

  const businessVerified = biz?.verification_status === "approved";
  const businessVerificationStatus = (biz?.verification_status as string | null) ?? null;
  const hasLocation = !!biz?.latitude && !!biz?.longitude;
  const hasHours =
    !!biz?.hours && typeof biz.hours === "object" && Object.keys(biz.hours as Record<string, unknown>).length > 0;

  let isOpenNow = false;
  if (biz?.id) {
    try {
      const { data: openResult } = await supabase.rpc("merchant_is_open_now", {
        p_business_id: biz.id,
      });
      isOpenNow = !!openResult;
    } catch {
      isOpenNow = false;
    }
  }

  // Superadmins run the platform and don't need a paid promotion to
  // surface their own businesses to travelers.
  const bypassPromotion = user.role === "superadmin";
  let hasActivePromotion = bypassPromotion;
  if (!bypassPromotion) {
    try {
      const { data: promo } = await supabase.rpc(
        "merchant_has_active_promotion",
        { p_merchant: user.id },
      );
      hasActivePromotion = !!promo;
    } catch {
      hasActivePromotion = false;
    }
  }

  // Count quests that travelers can actually play right now: live AND
  // inside their dates (Philippine time). Quests past their last day are
  // counted separately so the dashboard can say "run it again".
  const { data: liveQuests } = await supabase
    .from("travel_challenges")
    .select("status, date_range_start, date_range_end")
    .eq("merchant_id", user.id)
    .in("status", ["live", "expired"]);
  const today = manilaToday();
  const liveTravelChallenges = (liveQuests ?? []).filter((q) =>
    isQuestPlayable(q as QuestWindow, today)
  ).length;
  const endedQuests = (liveQuests ?? []).filter(
    (q) => questState(q as QuestWindow, today) === "ended"
  ).length;

  // Only what really decides whether travelers see you. Opening hours and
  // promotions are shown as tips, not blockers: the traveler-facing quest
  // and recommendation queries don't filter on either (see view 048).
  const blockers: string[] = [];
  if (!businessVerified) blockers.push("Business not verified by an admin yet");
  if (!hasLocation) blockers.push("Business location not set");
  if (liveTravelChallenges === 0) {
    blockers.push(
      endedQuests > 0
        ? `Your quest${endedQuests === 1 ? " has" : "s have"} ended — open it and tap "Run it again"`
        : "No live quests yet — make one in 3 steps"
    );
  }

  const isRecommendable = businessVerified && hasLocation && liveTravelChallenges > 0;

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
