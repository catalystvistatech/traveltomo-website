import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PlayerStopStatus,
  TravelProgressStatus,
} from "@/lib/constants/challenge-flow";

type CompletionRow = {
  id: string;
  player_status: string;
  completed_at: string | null;
  verification_status: string;
  reward_released: boolean | null;
  expires_at: string | null;
  accepted_at: string | null;
};

/**
 * Derives the traveler-facing stop status from a completion row (or null
 * when the user has never touched this stop).
 */
export function derivePlayerStopStatus(
  completion: CompletionRow | null,
  now = new Date()
): PlayerStopStatus {
  if (!completion) return "available";

  if (completion.player_status === "expired") return "expired";
  if (completion.player_status === "skipped") return "available";
  if (completion.player_status === "forfeited") return "available";

  if (
    completion.expires_at &&
    new Date(completion.expires_at) <= now &&
    !completion.completed_at
  ) {
    return "expired";
  }

  if (
    completion.verification_status === "verified" ||
    completion.player_status === "claimed"
  ) {
    return "claimed";
  }

  if (completion.completed_at && completion.verification_status === "pending") {
    return "submitted";
  }

  if (!completion.completed_at) {
    return "ongoing";
  }

  return "available";
}

/** Latest completion per challenge id for a user within one travel set. */
export async function loadStopCompletionsForTravelChallenge(
  client: SupabaseClient,
  userId: string,
  travelChallengeId: string
): Promise<Map<string, CompletionRow>> {
  const { data: children } = await client
    .from("challenges")
    .select("id")
    .eq("travel_challenge_id", travelChallengeId)
    .in("status", ["live", "approved"]);

  const childIds = (children ?? []).map((c) => c.id as string);
  if (childIds.length === 0) return new Map();

  const { data: completions } = await client
    .from("challenge_completions")
    .select(
      "id, challenge_id, player_status, completed_at, verification_status, reward_released, expires_at, accepted_at"
    )
    .eq("user_id", userId)
    .in("challenge_id", childIds)
    .order("accepted_at", { ascending: false });

  const byChallenge = new Map<string, CompletionRow>();
  for (const row of completions ?? []) {
    const challengeId = row.challenge_id as string;
    if (!byChallenge.has(challengeId)) {
      byChallenge.set(challengeId, row as CompletionRow);
    }
  }
  return byChallenge;
}

export async function loadActiveTravelProgress(
  client: SupabaseClient,
  userId: string,
  travelChallengeId: string
) {
  const { data } = await client
    .from("travel_challenge_progress")
    .select("id, status, started_at, completed_at, expires_at")
    .eq("user_id", userId)
    .eq("travel_challenge_id", travelChallengeId)
    .eq("status", "active")
    .maybeSingle();
  return data;
}

/** Creates or returns the user's active session for a travel-challenge set. */
export async function ensureTravelChallengeProgress(
  client: SupabaseClient,
  userId: string,
  travelChallengeId: string
) {
  const existing = await loadActiveTravelProgress(
    client,
    userId,
    travelChallengeId
  );
  if (existing) return existing;

  const { data, error } = await client
    .from("travel_challenge_progress")
    .insert({
      user_id: userId,
      travel_challenge_id: travelChallengeId,
      status: "active",
    })
    .select("id, status, started_at, completed_at, expires_at")
    .single();

  if (error) throw error;
  return data;
}

/** Marks the travel set completed when every live child stop is claimed. */
export async function syncTravelChallengeProgressCompletion(
  client: SupabaseClient,
  userId: string,
  travelChallengeId: string,
  progressId: string
) {
  const { data: children } = await client
    .from("challenges")
    .select("id")
    .eq("travel_challenge_id", travelChallengeId)
    .in("status", ["live", "approved"]);

  const childIds = (children ?? []).map((c) => c.id as string);
  if (childIds.length === 0) return;

  const completions = await loadStopCompletionsForTravelChallenge(
    client,
    userId,
    travelChallengeId
  );

  const claimedCount = childIds.filter(
    (id) => derivePlayerStopStatus(completions.get(id) ?? null) === "claimed"
  ).length;

  if (claimedCount < childIds.length) return;

  await client
    .from("travel_challenge_progress")
    .update({
      status: "completed" satisfies TravelProgressStatus,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", progressId)
    .eq("user_id", userId);
}

/** Builds progress summary for API responses. */
export function buildTravelProgressPayload(
  progress: {
    id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    expires_at: string | null;
  } | null,
  childIds: string[],
  completions: Map<string, CompletionRow>
) {
  const stopStatuses = childIds.map((id) =>
    derivePlayerStopStatus(completions.get(id) ?? null)
  );
  const claimedStops = stopStatuses.filter((s) => s === "claimed").length;
  const ongoingStops = stopStatuses.filter((s) => s === "ongoing").length;

  return progress
    ? {
        id: progress.id,
        status: progress.status,
        started_at: progress.started_at,
        completed_at: progress.completed_at,
        expires_at: progress.expires_at,
        total_stops: childIds.length,
        claimed_stops: claimedStops,
        ongoing_stops: ongoingStops,
        available_stops: stopStatuses.filter((s) => s === "available").length,
      }
    : null;
}

/** Completions that block a stop from appearing in the roll pool again. */
export function isStopRollable(status: PlayerStopStatus): boolean {
  return status === "available";
}

/** Exclude from nearby recommendation pool when user already finished or is mid-stop. */
export function isChallengeExcludedFromNearbyPool(
  status: PlayerStopStatus
): boolean {
  return status === "ongoing" || status === "submitted" || status === "claimed";
}
