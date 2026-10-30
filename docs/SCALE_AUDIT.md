# Scale Audit — Path to 20K Concurrent Users

**Date:** 2026-05-24
**Trigger:** Launch-day capacity planning for 20K users.

This document captures findings from the platform-wide scale audit
covering image pipelines, API hot paths, DB indexes, RLS shape, and
storage policies. Items already shipped are marked ?; deferred items
are the roadmap.

---

## ? Shipped in this audit

### iOS

- **`ChallengeProofStorage.swift`** — proof upload tightened from
  1600 px / q=0.82 to **1000 px / q=0.75**, and now strips EXIF / GPS /
  TIFF / IPTC metadata via `CGImageDestination` before upload. Average
  proof drops from ~400 KB to ~150-250 KB on the wire, and we no
  longer leak the device's GPS coordinates into a public bucket.
- **`CardBackdrop` default target size** — was 320x400, decoded at 4x
  on 160x200 cards. Now defaults to 200x260, which roughly halves
  decoded memory across the Home feed.

### Supabase

- **Migration 024** — `challenge-proofs` bucket:
  - Read policy switched from `TO public` to `TO authenticated` so
    anon can no longer enumerate every user's selfies via
    `storage.from(...).list()`.
  - `file_size_limit` set to 1 MB; iOS uploads come in well under this.
- **Migration 025** — five new indexes covering completions ordering
  (`user_accepted`, `user_completed`), child-stop lookup
  (`challenges_travel_status`), the accept-race partial unique
  (`one_active_per_challenge`), and the spatial-filter pre-req
  (`businesses_location_approved`). Also dedupes the 13 leftover
  in-flight duplicate completion rows from before the unique index.
- **Migration 026** — codifies the `public-assets` bucket (was
  created via dashboard, no migration record). 5 MB cap, public-read,
  merchants/admins-only write.

### Backend

- **`/v1/places/[id]`** — `'published'` ? `'live'` typo fix; was
  returning zero tagged challenges forever.
- **`/v1/challenges/[id]/accept`** — race-safe via `ON CONFLICT DO
  NOTHING` against the new partial unique index. Concurrent retry
  storms now collapse into a single row.
- **HTTP cache headers** on read-mostly routes:
  - `/v1/travel-challenges` — `public, s-maxage=30, stale-while-revalidate=300`
  - `/v1/travel-challenges/:id` — `private, max-age=20`
  - `/v1/me/active-challenge` — `private, max-age=15`
  - `/v1/me/rewards` — `private, max-age=30`
- **`uploadTravelChallengeCover`** — uploads with
  `Cache-Control: 31536000, immutable` and randomized filenames so
  the CDN can serve covers for a year without revalidating. Replaces
  the old `upsert: true` pattern that served stale bytes after a
  cover change.

---

## ?? Deferred — roadmap

### P0 — Architecture changes

#### 1. Geo-filtered `/v1/recommendations` and `/v1/travel-challenges`

**Current**: both routes do `.from(...).limit(limit * 3)` to fetch
hundreds of rows, then haversine-filter in Node. At 20K concurrent
home opens this is the single hottest path in the system.

**Target**: push the lat/lng bounding-box filter into SQL. Either:
- Add a SECURITY DEFINER function `nearby_travel_challenges(lat, lng,
  max_radius_m)` that uses
  `idx_businesses_location_approved` (already shipped) with explicit
  `BETWEEN` predicates, or
- Migrate to PostGIS `geography(POINT,4326)` + GiST + `ST_DWithin`.

The PostGIS path is the long-term win because it also supports
ordering by distance natively and scales to >100K businesses.

#### 2. `recommended_challenges` view per-row PL/pgSQL helpers

**Current**: `recommended_challenges` (migration 014) calls
`merchant_is_open_now(b.id)` and `merchant_has_active_promotion(c.merchant_id)`
**per output row**. Each helper does its own `SELECT`. With 1000 live
challenges × 20K users this is the second hottest path.

**Target**: materialize these as columns on `businesses` /
`merchant_subscriptions` updated by a cron job (every minute) or move
to a single CTE that computes both per merchant once.

#### 3. Google Places photo proxy

**Current**: `places.image_url` is a hot-linked
`places.googleapis.com/.../media?...&key=AIza...` URL. Every iOS
client gets the API key in plaintext, and every cache miss is a paid
Google call.

**Target**: new route `/v1/places/photo?ref=...&w=480` that:
1. Fetches from Google with the server-side key.
2. Returns the bytes with `Cache-Control: 31536000, immutable`.
3. (Optionally) pipes through `sharp().webp({ quality: 80 })` and
   stores the result in `public-assets/place-photos/{ref}.webp` for
   permanent CDN serving.

Replace `places.image_url` writes to point at our CDN-friendly URL.

### P0 — iOS UI

#### 4. `AsyncImage` ? `CachedRemoteImage` across the app

**Current**: `MerchantScannerView`, `PlaceChallengesView`,
`ProfileEditView`, `HomeHeaderView` still use stock `AsyncImage`. Each
render re-downloads, no downsample, no eviction policy. A merchant
verifying 50 proofs downloads 50 × ~400 KB per session, no reuse.

**Target**: replace every `AsyncImage` call site with
`CachedRemoteImage` (or a circular avatar variant). Plain refactor,
~10 lines per call.

### P0 — Anti-abuse

#### 5. Rate limiting + signed receipts on `grant_skip_from_ad`

**Current**: any authenticated client can POST `{action: "grant_ad"}`
in a loop and get unlimited skip tokens. No ad-network receipt
verification, no cooldown.

**Target**:
- Require a signed receipt from AdMob SSV or Apple AdServices, verified
  server-side.
- Add `profiles.last_ad_grant_at` + a 30 s minimum interval enforced in
  the RPC.
- Cap `profiles.extra_skips` at e.g. 5.

#### 6. Sliding-window rate limits on `/v1/redemptions/verify`

**Current**: a compromised merchant account can grind ~1B 6-char codes
with no backoff.

**Target**: Vercel KV / Upstash sliding-window counter keyed by
`(merchant_user_id, ip)`. On `not_found` results, increment and 429
above e.g. 30/min. Log every failure for SIEM.

### P1 — Smaller refactors

#### 7. Server-side cover resize in `uploadTravelChallengeCover`

**Current**: 5 MB ceiling enforced server-side but no resize. A 4K
cover lands at full size and iOS downsamples on display - the wire and
CDN cost is real.

**Target**: pipe the upload buffer through
`sharp().resize({ width: 1280 }).webp({ quality: 80 })`. Covers drop
from ~3 MB to ~150 KB each. `sharp` is already in `package-lock.json`.

#### 8. Replace SELECT-then-action chain in `ensureTravelChallengeProgress`

**Current**: `lib/challenge-progress.ts:109-135` does SELECT (active
progress) + maybe INSERT. Two DB round trips for an idempotent op
called on every dice roll.

**Target**: single `INSERT ... ON CONFLICT DO NOTHING RETURNING *`
against `idx_travel_progress_one_active` + fallback SELECT only when
RETURNING is empty.

#### 9. Fuse `loadStopCompletionsForTravelChallenge` into one query

**Current**: two sequential queries (child IDs, then completions).

**Target**: one PostgREST `or` filter, or a `get_travel_quest_view(p_user,
p_travel_challenge_id)` RPC returning the combined payload.

#### 10. Replace `MapViewModel.refreshQuestStatus` re-fetch

**Current**: `refreshQuestStatus(id:)` re-fetches the full quest detail
after every verification. Four round-trips total per stop completion.

**Target**: have `/v1/challenges/:id/complete` and
`/v1/redemptions/verify` return a `progress` patch so the iOS client
applies it locally without a fetch.

#### 11. Dedupe `acceptChallenge` calls on the iOS client

**Current**: three code paths in `MapViewModel` fire
`Task.detached { _ = try await acceptChallenge(challengeId) }` on the
same node (Navigate, Verify, Accept). Server dedups via SELECT (now
the new unique index), but the iOS side could simply cache the
resulting `completion_id` per `(userId, challengeId)`.

#### 12. iOS `APICache` coverage for quest endpoints

**Current**: only `nearbyPlaces` and `trendingPlaces` are coalesced
& cached.

**Target**: wrap `travelChallenges`, `recommendations`,
`travelChallengeDetail`, `activeChallenge` in
`APICache.shared.value(for:ttl:)` with TTLs of 15-60 s. Pairs well
with the new HTTP cache headers — iOS NSURLCache + APICache + Vercel
CDN form three layers of defense.

### P2 — Smaller wins

- Drop `MapViewModel.grantSkipFromAd`'s redundant `refreshSkipTokens()`
  follow-up — the grant RPC already returns the new status.
- `toggleEstablishmentFilter` fires both `loadRecommendations` and
  `loadNearbyRoll`; one is enough.
- `next.config.ts` — add `images.remotePatterns` for the Supabase
  Storage hostname so the marketing site's `next/image` can serve
  WebP / AVIF.
- Drop `MerchantScannerView`'s `<img>` for `CachedRemoteImage` (or at
  least set `loading="lazy"` if we keep it).
- Add `Cache-Control` headers to `/v1/recommendations` once it's
  geo-filtered (today the response depends on the authenticated user's
  completion state, so we can't just slap `s-maxage` on it without
  splitting into a `/v1/recommendations` public + `/v1/me/finished-stops`
  subtract pattern).
- Migrate `MapViewModel.skipTokenStatus` polling to a single per-quest
  read instead of polling the global RPC.

---

## How to know if you're past the bottleneck

Pre-launch, set up:

1. **Supabase observability**: turn on slow query logs (>50 ms) and
   pgbouncer connection metrics. The `recommended_challenges` view
   should *not* show up.
2. **Vercel Analytics**: watch p95 latency on `/v1/travel-challenges`,
   `/v1/recommendations`, `/v1/me/active-challenge`. Sub-100 ms
   p95 is the target.
3. **Storage egress**: Supabase dashboard's Storage section should
   show <10 GB/day at 20K DAU once the cover and proof pipelines are
   sized correctly.
4. **Google Cloud billing**: Places API spend should be flat after the
   photo proxy ships — a sudden spike means someone's hot-linking
   Google URLs again.
