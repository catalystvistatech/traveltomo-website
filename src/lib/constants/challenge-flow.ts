/** Free skip tokens granted per refill window. */
export const SKIP_TOKEN_MAX_FREE = 3;

/** Hours between automatic free-skip refills. */
export const SKIP_REFILL_HOURS = 3;

/** Current publish requirement; roll pools use actual incomplete stop count. */
export const DEFAULT_TRAVEL_STACK_SIZE = 6;

/** Player-facing status for an individual stop in a stack. */
export const PLAYER_STOP_STATUSES = [
  "available",
  "ongoing",
  "submitted",
  "claimed",
  "expired",
] as const;

export type PlayerStopStatus = (typeof PLAYER_STOP_STATUSES)[number];

/** Player-facing status for a travel-challenge set session. */
export const TRAVEL_PROGRESS_STATUSES = [
  "active",
  "completed",
  "expired",
  "abandoned",
] as const;

export type TravelProgressStatus = (typeof TRAVEL_PROGRESS_STATUSES)[number];
