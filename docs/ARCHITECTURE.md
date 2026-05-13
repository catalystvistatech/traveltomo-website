# TravelTomo Platform Architecture

**Last updated:** 2026-04-29
**Audience:** Any developer working on TravelTomo (iOS, web, future Android).

---

## 1. System Overview

TravelTomo is a gamified travel companion with three planned client applications sharing a single Supabase backend.

```
                         +-------------------+
                         |     Supabase      |
                         |  (PostgreSQL +    |
                         |   Auth + Storage  |
                         |   + Edge Fns)     |
                         +---+-----+-----+--+
                             |     |     |
                    +--------+  +--+--+  +--------+
                    |           |     |           |
              +-----+----+ +---+---+ +----+------+
              | iOS App  | |  Web  | | Android   |
              | (Swift/  | | Admin | | (Kotlin/  |
              |  SwiftUI)| | (Next | |  Compose) |
              |          | |  .js) | |           |
              +----------+ +------+ +-----------+
                  MVP        MVP       Planned
```

### Shared Backend Contract

All clients consume the same Supabase schema. The database is the authoritative source for:
- User authentication and roles
- Business profiles
- Challenge definitions and lifecycle
- Reward definitions and redemption tracking
- Place/POI data
- Challenge completion records

RLS policies enforce authorization at the database level. Clients are thin consumers.

---

## 2. Database Schema

### Tables

| Table | Purpose | Primary Consumers |
|-------|---------|-------------------|
| `profiles` | User profiles (extends auth.users), includes `role` column | All clients |
| `businesses` | Merchant business details | Web dashboard |
| `places` | Points of interest / map nodes | iOS app, Web dashboard |
| `challenges` | Challenge definitions with status lifecycle | All clients |
| `rewards` | Rewards tied to challenges (QR-based) | All clients |
| `challenge_completions` | Records of users completing challenges | iOS app (write), Web (read) |
| `reward_redemptions` | Records of users redeeming rewards | iOS app (write), Web (read) |

### Entity Relationship

```
profiles (role: user/merchant/admin)
  |-- 1:1 --> businesses (merchant_id)
  |-- 1:N --> challenges (merchant_id)
  |-- 1:N --> challenge_completions (user_id)
  |-- 1:N --> reward_redemptions (user_id)

places
  |-- 1:N --> challenges (place_id)

challenges
  |-- 1:N --> rewards (challenge_id)

rewards
  |-- 1:N --> reward_redemptions (reward_id)
```

### Challenge Status Lifecycle

```
draft --> pending_review --> approved --> live
                        \-> rejected       |
                                           v
                                         paused
```

- **draft**: Merchant is still editing.
- **pending_review**: Merchant submitted, waiting for admin.
- **approved**: Admin approved but not yet visible to app users.
- **live**: Visible to iOS/Android app users.
- **rejected**: Admin rejected with notes. Merchant can edit and resubmit.
- **paused**: Temporarily hidden from app users.

Only challenges with `status = 'live'` are returned to mobile app users via RLS.

### Role System

Roles are stored in `profiles.role` and synced to `auth.users.raw_app_meta_data` via a Postgres trigger (`sync_role_to_app_metadata`). This makes the role available in JWT claims:

```sql
-- In RLS policies:
(auth.jwt()->'app_metadata'->>'role') = 'admin'
```

| Role | Can Do |
|------|--------|
| `user` | Read live challenges/places, submit completions/redemptions |
| `merchant` | All user abilities + CRUD own business/challenges/rewards |
| `admin` | All merchant abilities + approve/reject any challenge, manage all merchants/places |
| `superadmin` | All admin abilities **plus** owns businesses + travel challenges directly, bypasses the verification queue (auto-approved on create, edits stay approved), and is exempt from the paid-promotion gate on the Recommendation Status card |

A new signup always gets `role = 'user'`. Promotion to `merchant` or `admin` is done via direct SQL update on `profiles.role`.

#### Superadmin auto-approval

`superadmin` is the only role that bypasses admin review:
- `upsertBusiness` writes `verification_status = 'approved'` and stamps `verified_by` on insert, and on update keeps an approved business approved instead of bouncing it back to `pending`.
- `submitBusinessForVerification` self-approves on submit.
- `submitChallengeForReview` (standalone) writes `status = 'live'` directly with `approved_at` set, instead of the usual `pending_review`.
- `createTravelChallenge` accepts any of the superadmin's own businesses regardless of `verification_status`. `submitTravelChallengeForReview` already publishes straight to `live` for every caller.
- `getRecommendationStatus` skips the "active promotion subscription" blocker for superadmin so their own listings surface to travelers without a paid plan.

The bypass is implemented in application code only; RLS continues to enforce that the row's `merchant_id = auth.uid()` and that the JWT role is one of the allowed ones.

---

## 3. Web Dashboard (Next.js)

### Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui v4 (@base-ui/react) |
| Auth | @supabase/ssr (PKCE flow) |
| Validation | Zod |
| Deployment | Vercel |

### Route Structure

```
(auth)/
  login/              -- Email/password sign-in
  register/           -- Merchant registration
  auth/callback/      -- PKCE code exchange

(dashboard)/
  /                   -- Overview (stats, quick actions)
  business/           -- Business profile CRUD
  challenges/         -- Challenge list
  challenges/new/     -- 5-step creation wizard
  challenges/[id]/    -- Challenge detail + edit
  rewards/            -- Reward management
  completions/        -- Pending verification queue
  claims/             -- Full claim history (filters + CSV export)
  analytics/          -- Stacked daily chart, top challenges, top travelers
  admin/challenges/   -- Approval queue (admin only)
  admin/merchants/    -- Merchant list (admin only)
  admin/places/       -- POI management (admin only)
```

### Security Architecture

1. **Middleware** (`src/middleware.ts`): Refreshes auth session on every request, redirects unauthenticated users to `/login`.
2. **Dashboard Layout** (`(dashboard)/layout.tsx`): Server component that calls `getUser()` and checks role. Users with `role = 'user'` see an access denied page.
3. **Server Actions**: All data mutations go through `"use server"` functions in `src/lib/actions/`. Each action validates input with Zod and authenticates via `getUser()`.
4. **Admin Client**: `src/lib/supabase/admin.ts` creates a `service_role` client for admin-only operations (e.g., approving challenges across merchants). Only used in Server Actions, never exposed to the browser.
5. **Security Headers**: `next.config.ts` sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy`.

---

## 4. iOS App (Swift/SwiftUI)

The canonical **client-owned** iOS repository is [catalystvistatech/traveltomo-ios](https://github.com/catalystvistatech/traveltomo-ios) (milestone 1 complete; product control lives with that remote). See [CLIENT_REPOS.md](CLIENT_REPOS.md) for repo ownership and how this relates to local checkouts.

### Stack

| Layer | Technology |
|-------|-----------|
| Language | Swift 6 |
| UI | SwiftUI (iOS 17+, @Observable) |
| Architecture | MVVM + Clean-ish layering |
| Auth | Supabase Swift SDK (PKCE) |
| Maps | MapKit (Apple Maps) |
| Haptics | UIFeedbackGenerator |

### Key Patterns

- `@Observable` + `@MainActor` on all ViewModels
- State-machine router (`AppRouter`) for navigation
- `AuthServiceProtocol` with `SupabaseAuthService` / `MockAuthService` implementations
- Gilroy font family via `AppFonts` helper
- `AppColors` centralized design tokens (primary red: #D12D34)

### Module Map

```
Core/
  Services/Auth/     -- Auth protocol, Supabase impl, social sign-in
  Services/Supabase/ -- Client config
  Theme/             -- AppColors, AppFonts

Presentation/
  Components/        -- Reusable UI (PrimaryButton, CardBackdrop, etc.)
  Navigation/        -- AppRouter state machine
  Screens/           -- Auth, Onboarding, Main (Home, Map, Profile, Settings)
  ViewModels/        -- AuthViewModel, MapViewModel
```

---

## 5. Android App (Planned)

### Target Stack

| Layer | Technology |
|-------|-----------|
| Language | Kotlin |
| UI | Jetpack Compose |
| Architecture | MVVM |
| Auth | Supabase Kotlin SDK (PKCE) |
| Maps | Google Maps SDK for Android |

### Integration Contract

The Android app must:
- Authenticate via Supabase Auth with PKCE flow
- Read the `role` from `app_metadata` JWT claim
- Consume the same `challenges`, `places`, `rewards` tables via RLS
- Submit `challenge_completions` and `reward_redemptions` with `user_id = auth.uid()`
- Never bypass or duplicate RLS logic in application code

No schema changes should be needed to support Android � the backend is client-agnostic.

---

## 6. Environment Configuration

### Web Dashboard

| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Bypasses RLS (Server Actions only) |

### iOS App

| Variable | Source | Description |
|----------|--------|-------------|
| `SUPABASE_URL` | `.xcconfig` (gitignored) | Supabase project URL |
| `SUPABASE_ANON_KEY` | `.xcconfig` (gitignored) | Supabase anon key |
| `GOOGLE_MAPS_API_KEY` | `.xcconfig` (gitignored) | Google Maps (if used) |

### Android App (Future)

| Variable | Source | Description |
|----------|--------|-------------|
| `SUPABASE_URL` | `local.properties` (gitignored) | Supabase project URL |
| `SUPABASE_ANON_KEY` | `local.properties` (gitignored) | Supabase anon key |
| `MAPS_API_KEY` | `local.properties` (gitignored) | Google Maps API key |

---

## 7. Migration Files

All SQL migrations live in `supabase/` with sequential prefixes:

| File | Description |
|------|-------------|
| `001_schema.sql` | Initial schema: profiles, businesses, places, challenges, rewards, completions, redemptions + all RLS + triggers |
| `016_realtime_role_check.sql` | Move every role-based RLS policy from `auth.jwt()->'app_metadata'->>'role'` to `public.current_user_role()`, a `SECURITY DEFINER STABLE` helper that reads from `public.profiles`. Eliminates the "merchant just got approved but still gets RLS-denied" class of bug — role changes now propagate to RLS on the very next request without any session refresh. |
| `017_places_cache_freshness.sql` | Add `places.refreshed_at`, `places.prewarmed`, `places.refresh_source` plus a composite `(latitude, longitude, refreshed_at DESC)` index so `/v1/places` can use `public.places` as a 24-hour write-through cache for the Google Places API. Without this every nearby/trending request paid Google's Enterprise+Atmosphere SKU (~$47/1k) every time. |

When adding new migrations, create `002_description.sql`, `003_description.sql`, etc.

## Google Places cache

The `/v1/places` route is the most expensive endpoint in the system (Places API New, Enterprise+Atmosphere SKU at ~$47 per 1k calls). Three layers cap the spend:

1. **24-hour Postgres cache** — `lookupCachedPlaces` queries the `places` table for rows within a 5 km bounding box of the caller that were `refreshed_at` within `PLACES_CACHE_TTL_HOURS` (default 24 h) OR flagged `prewarmed = true`. If the lookup returns at least 6 rows (10 for trending), the route serves them directly and never touches Google. Refresh-on-write semantics: every `mirrorPlaces` upsert bumps `refreshed_at`, so a single Google call refills the cache for that area's next ~24 h of requests.
2. **Tight field mask** — `places.formattedAddress` was removed (we already had `shortFormattedAddress`). Photos, rating, and review count are kept because the home cards depend on them; removing those is the only remaining way to drop into the Enterprise SKU tier and save ~25% per Google call, at the cost of fallback gradients on the home feed. Tradeoff documented inline in `src/lib/google/places.ts`.
3. **Pre-warmed launch markets** — `scripts/prewarm-places.ts` (run via `pnpm prewarm:places` or `npm run prewarm:places`) seeds the cache for Angeles City, Clark Freeport, and Boracay with ~8 Google calls each, marked `prewarmed = true` so they bypass the TTL. After running it once, the vast majority of regular user traffic in those cities hits Postgres directly.

---

## 8. Decision Log

| Date | Decision | Alternatives | Why | Affects |
|------|----------|-------------|-----|---------|
| 2026-04-22 | Supabase as single backend for all clients | Firebase, custom API | Postgres RLS is the auth layer, no server to maintain, SDKs for Swift/Kotlin/JS | All |
| 2026-04-22 | Role in app_metadata via trigger | Role in user_metadata, role in JWT custom claims | user_metadata is user-editable (security risk), trigger auto-syncs | All |
| 2026-04-22 | PKCE flow for all clients | Implicit flow | PKCE is the 2026 standard for mobile + SSR, implicit is deprecated | All |
| 2026-04-22 | Server Actions for web mutations | API routes, direct client writes | Built-in CSRF protection, Zod validation, service_role stays server-side | Web |
| 2026-04-22 | shadcn/ui v4 with @base-ui/react | Radix-based shadcn v1, custom components | Latest stable, render prop pattern, good DX | Web |
| 2026-04-22 | Dark theme (zinc-950) for dashboard | Light theme, auto theme | Matches TravelTomo iOS brand (black backgrounds) | Web |
| 2026-04-19 | MapKit + bundled assets for iOS imagery | Google Places API | Zero cost, no 3rd-party disclosure, covers MVP scope | iOS |
| 2026-04-19 | Hide Facebook auth behind feature flag | Delete or fully implement | 1-line re-enable vs reimplementation | iOS |
| 2026-04-29 | iOS app source of truth at catalystvistatech/traveltomo-ios | Single monorepo, vendor-only remote | Client-owned repo after milestone 1; team control and clear handoff | iOS |
| 2026-05-13 | `GET /v1/me/rewards` returns the caller's completions + reward detail | Reuse `/v1/redemptions/lookup` (merchant-only), per-challenge fetch | Single round-trip for the iOS "My Rewards" screen; surfaces pending verification codes the user must show the merchant, plus verified/rejected history; reuses existing RLS on `challenge_completions` via the user's JWT | iOS / Android |
| 2026-05-13 | `/admin/claims` claim-history page + `getMerchantClaimAnalytics` Server Action | Reuse `/admin/completions` (verification-only), single chart library | Merchants need to audit *every* claim (pending, claimed, rejected) with filters + CSV export, not just the pending queue. Analytics action rolls daily counts, per-challenge breakdown, and top customers in one query — no chart dependency added, the bars are inline divs to keep bundle slim | Web |
| 2026-05-13 | `superadmin` role bypasses business + challenge verification queues | Require superadmins to admin-approve themselves; create a separate `platform` role | Superadmins already have admin powers and own the marketplace; routing their own listings through an admin queue they themselves staff is busywork. RLS still pins ownership via `merchant_id`, and the bypass lives entirely in application code so it stays auditable | Web |
| 2026-05-13 | Role-based RLS reads from `public.profiles` via `current_user_role()` instead of the JWT `app_metadata` | Force users to log out + back in after a role change; add a client refresh hook; invalidate refresh tokens on every role mutation | The JWT is only refreshed on login or access-token rotation, so admin role promotions weren't visible to RLS until the user re-authed (a "just-approved merchant still can't create challenges" report). Reading the profile through a `STABLE` `SECURITY DEFINER` helper makes role changes propagate immediately and keeps the JWT layer untouched, so existing clients keep working without a forced sign-out | All |
| 2026-05-13 | Pending merchants (`merchant_request_status != 'approved'`) blocked from all business CRUD | Allow business creation pre-approval as "application material"; rely solely on UI to hide the button; only gate at RLS | Pending merchants could previously submit a business for verification before an admin had even reviewed them, letting unvetted accounts queue verification work. The fix gates `upsertBusiness`, `submitBusinessForVerification`, and `deleteBusiness` at the server-action layer with `assertBusinessWriteAllowed`, and replaces the Business Profile UI with a locked "approval pending" state. Admin / superadmin always pass through | Web |
| 2026-05-13 | `/v1/places` becomes a 24-hour write-through Postgres cache + prewarmed launch markets | Per-request Google call (status quo); offload to Redis / external cache; hard-cap Places to free tier | Places API New billed every nearby/trending request at ~$47/1k. Cache pattern is built into the same `public.places` table that already mirrored Google output, so the surface change is minimal and merchants/challenges still link to stable UUIDs. Pre-warmed rows (`prewarmed = true`) never expire so admins can keep Angeles / Boracay / Clark hot with one script run | Web (cost) |
