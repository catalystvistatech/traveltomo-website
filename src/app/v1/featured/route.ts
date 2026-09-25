import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/api";

/**
 * GET /v1/featured?lat=..&lng=..&limit=8&max_radius_km=150
 *
 * Backs the app's "Travel Tomo Featured" rail. Returns MERCHANTS (businesses)
 * that have at least one live quest — one row per business, never one per
 * quest — so the rail reads as a hero carousel of merchants rather than a
 * duplicate of the Quests list.
 *
 * Why this exists: the rail used to be fed by `/v1/places?mode=trending`,
 * i.e. the Google Places mirror. That payload has no merchant field at all
 * (only a `has_live_challenges` boolean), and its ranking is
 * `rating × log10(reviews)` — a scoring function that structurally buries
 * small local merchants beneath tourist landmarks. Merchants could never win
 * that rail no matter how it was tuned.
 *
 * Radius rule — deliberately WIDER than `/v1/travel-challenges`. That endpoint
 * gates on each business's own `service_radius_meters` (often 100 m–2 km),
 * which is right for "quests you can play right now" but would leave the
 * Featured rail empty — and therefore hide the top section of Home — for
 * anyone not standing in one of the few merchant towns. Featured instead uses
 * one generous ceiling and sorts nearest-first, so a user in a nearby city
 * still discovers real merchants.
 *
 * Ranking: active promotion tier first, then distance, then quest recency.
 * The promotion term is promotion-OPTIONAL: with no active subscriptions
 * every merchant ranks 0 and the list falls through to distance, so this
 * works today and starts honoring paid placement automatically once a
 * subscription goes active — no client release required.
 *
 * Uses the admin client (the `travel_challenges` RLS policy is
 * `TO authenticated`, and business rows are only traveler-readable when
 * approved) with EXPLICIT public-visibility filters applied here instead:
 * business approved, quest live and not soft-deleted.
 */

/** Generous default so the rail isn't empty outside merchant towns. */
const DEFAULT_MAX_RADIUS_KM = 150;
const DEFAULT_LIMIT = 8;
/** Upper bound on rows scanned before distance filtering + dedupe. */
const MAX_SCAN_ROWS = 500;

export async function GET(request: Request) {
  // Auth gate. Every table this route touches has RLS scoped `TO
  // authenticated`, and the handler deliberately bypasses RLS via the admin
  // client below — so without this check the endpoint would republish
  // authenticated-only merchant data (and, once promotions go live, paid-tier
  // signals) to anonymous callers. The iOS client already sends a Bearer
  // token on every /v1 request, so this costs the app nothing.
  const { user, error: authError } = await requireUser(request);
  if (authError || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? `${DEFAULT_LIMIT}`) || DEFAULT_LIMIT, 1),
    20
  );
  const maxRadiusKm =
    parseFloat(searchParams.get("max_radius_km") ?? `${DEFAULT_MAX_RADIUS_KM}`) ||
    DEFAULT_MAX_RADIUS_KM;
  const maxRadiusMeters = maxRadiusKm * 1000;

  const supabase = createAdminClient();

  // Live quests + their owning (approved) business. `!inner` makes the
  // business filter a join condition, so quests whose business isn't
  // approved drop out entirely rather than arriving with a null embed.
  const { data, error } = await supabase
    .from("travel_challenges")
    .select(
      `id, title, cover_url, created_at,
       big_reward_title, big_reward_discount_type, big_reward_discount_value,
       business:businesses!travel_challenges_business_id_fkey!inner (
         id, merchant_id, name, city, latitude, longitude,
         establishment_type, logo_url, verification_status
       ),
       children:challenges!travel_challenge_id ( id, status )`
    )
    .eq("status", "live")
    .is("deleted_at", null)
    .eq("business.verification_status", "approved")
    // Bounded read. Distance and dedupe happen in JS, so this can't be the
    // page size — but it must not be unbounded either: without a ceiling the
    // row count grows with the whole live-quest catalogue on every request.
    // Generous enough that the nearest merchants are always inside it.
    .limit(MAX_SCAN_ROWS);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string;
    title: string;
    cover_url: string | null;
    created_at: string;
    big_reward_title: string | null;
    big_reward_discount_type: string | null;
    big_reward_discount_value: number | null;
    business: {
      id: string;
      merchant_id: string;
      name: string;
      city: string | null;
      latitude: number | null;
      longitude: number | null;
      establishment_type: string | null;
      logo_url: string | null;
      verification_status: string | null;
    } | null;
    children: { id: string; status: string }[] | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const businessIds = Array.from(
    new Set(rows.map((r) => r.business?.id).filter((v): v is string => !!v))
  );
  const merchantIds = Array.from(
    new Set(rows.map((r) => r.business?.merchant_id).filter((v): v is string => !!v))
  );

  if (businessIds.length === 0) {
    return NextResponse.json({ data: [], count: 0 }, { headers: CACHE_HEADERS });
  }

  // Two bulk lookups instead of per-row work: the mirrored place (hero image
  // + a place id the client can deep-link) and the active promotion tier.
  const [placesRes, subsRes] = await Promise.all([
    supabase
      .from("places")
      .select("id, business_id, image_url")
      .in("business_id", businessIds),
    supabase
      .from("merchant_subscriptions")
      .select("merchant_id, tier, status, starts_at, ends_at")
      .in("merchant_id", merchantIds)
      .eq("status", "active"),
  ]);

  // These two are enrichment, not the payload: a failure degrades imagery or
  // promotion ordering but shouldn't 500 the rail. Log loudly so a broken
  // lookup can't masquerade as "no promotions / no photos" forever.
  if (placesRes.error) {
    console.error("featured: places lookup failed", placesRes.error.message);
  }
  if (subsRes.error) {
    console.error("featured: subscriptions lookup failed", subsRes.error.message);
  }

  const placeByBusiness = new Map<string, { id: string; image_url: string | null }>();
  for (const p of (placesRes.data ?? []) as {
    id: string;
    business_id: string | null;
    image_url: string | null;
  }[]) {
    if (p.business_id && !placeByBusiness.has(p.business_id)) {
      placeByBusiness.set(p.business_id, { id: p.id, image_url: p.image_url });
    }
  }

  // Mirrors public.merchant_promotion_rank (migration 053): highest active
  // tier wins, and only inside its [starts_at, ends_at) window.
  const TIER_RANK: Record<string, number> = { premium: 3, featured: 2, basic: 1 };
  const now = Date.now();
  const rankByMerchant = new Map<string, number>();
  for (const s of (subsRes.data ?? []) as {
    merchant_id: string;
    tier: string | null;
    starts_at: string | null;
    ends_at: string | null;
  }[]) {
    const startsOk = !s.starts_at || Date.parse(s.starts_at) <= now;
    const endsOk = !s.ends_at || Date.parse(s.ends_at) > now;
    if (!startsOk || !endsOk) continue;
    const rank = TIER_RANK[s.tier ?? ""] ?? 0;
    rankByMerchant.set(
      s.merchant_id,
      Math.max(rankByMerchant.get(s.merchant_id) ?? 0, rank)
    );
  }

  const hasCoord = Number.isFinite(lat) && Number.isFinite(lng);

  const mapped = rows.flatMap((r) => {
    const b = r.business;
    if (!b) return [];
    // Defense in depth. The `!inner` join above already restricts this to
    // approved businesses, but this rail is public and runs on the admin
    // client (RLS bypassed) — so re-assert the visibility rule here rather
    // than trust a single filter to hold forever.
    if (b.verification_status !== "approved") return [];
    const distance =
      hasCoord && b.latitude != null && b.longitude != null
        ? haversine(lat, lng, b.latitude, b.longitude)
        : null;
    const place = placeByBusiness.get(b.id) ?? null;
    const liveStops = (r.children ?? []).filter((c) => c.status === "live").length;

    return [
      {
        business_id: b.id,
        business_name: b.name,
        city: b.city,
        establishment_type: b.establishment_type,
        latitude: b.latitude,
        longitude: b.longitude,
        distance_meters: distance,
        // Merchants rarely upload a logo, so fall back to the mirrored
        // place photo and then the quest cover. All three can be null —
        // the client renders its own gradient placeholder.
        image_url: b.logo_url ?? place?.image_url ?? r.cover_url ?? null,
        place_id: place?.id ?? null,
        quest_id: r.id,
        quest_title: r.title,
        reward_title: r.big_reward_title,
        reward_discount_type: r.big_reward_discount_type,
        reward_discount_value: r.big_reward_discount_value,
        stop_count: liveStops,
        // `is_promoted` is a user-facing ad disclosure, so it ships. The
        // numeric tier does NOT: `merchant_subscriptions` is owner-private
        // commercial data, and exposing the exact tier would tell every
        // merchant which plan their competitors bought. Kept internal, used
        // only for ordering below.
        is_promoted: (rankByMerchant.get(b.merchant_id) ?? 0) > 0,
        /** Internal ordering key — stripped before the response is sent. */
        _rank: rankByMerchant.get(b.merchant_id) ?? 0,
        created_at: r.created_at,
      },
    ];
  });

  // One generous ceiling instead of the per-business service radius.
  const inRange = hasCoord
    ? mapped.filter(
        (r) => r.distance_meters != null && r.distance_meters <= maxRadiusMeters
      )
    : mapped;

  // One card per merchant: keep that merchant's best (newest) live quest.
  const bestByBusiness = new Map<string, (typeof inRange)[number]>();
  for (const r of inRange) {
    const existing = bestByBusiness.get(r.business_id);
    if (!existing || Date.parse(r.created_at) > Date.parse(existing.created_at)) {
      bestByBusiness.set(r.business_id, r);
    }
  }

  const deduped = Array.from(bestByBusiness.values()).sort((a, b) => {
    if (b._rank !== a._rank) return b._rank - a._rank;
    const da = a.distance_meters ?? Number.POSITIVE_INFINITY;
    const db = b.distance_meters ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });

  // Strip the internal ranking key so the paid tier never reaches a client.
  const page = deduped
    .slice(0, limit)
    .map(({ _rank, ...row }) => row); // eslint-disable-line @typescript-eslint/no-unused-vars

  return NextResponse.json(
    { data: page, count: page.length, total: deduped.length },
    { headers: CACHE_HEADERS }
  );
}

/**
 * `private` on purpose: the route is auth-gated, so a shared CDN entry could
 * otherwise satisfy a request that never presented a token. The body carries
 * no per-user data, but the *right to see it* is per-user — so only the
 * device may cache it.
 */
const CACHE_HEADERS = {
  "Cache-Control": "private, max-age=30",
};

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
