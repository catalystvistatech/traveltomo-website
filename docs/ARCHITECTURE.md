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

A new signup always gets `role = 'user'`. Promotion to `merchant` or `admin` is done via direct SQL update on `profiles.role`.

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
  analytics/          -- Completions, redemptions, conversion
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

When adding new migrations, create `002_description.sql`, `003_description.sql`, etc.

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
