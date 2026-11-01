# Migration Audit: supabase/001-032

Date: 2026-05-29
Branch: `chore/migration-audit`
Scope: read-only audit of every file in `supabase/*.sql` (001 through 032),
plus one additive forward-fix migration (`033_audit_fixes.sql`). No
historical migration was rewritten - everything below is "fix forward"
so the repo stays in sync with the live database that already has
001-032 applied.

---

## Summary

The schema is in good shape. RLS is enabled with at least one policy on
every `public` table, authorization consistently uses `auth.uid()` and
either `app_metadata` or the `public.current_user_role()` SECURITY
DEFINER helper (never `user_metadata`), and every SECURITY DEFINER
function pins `SET search_path = ''`.

The audit found a small number of concrete, safe forward-fixes
(2 missing RLS-backing indexes, 4 helper functions with a mutable
search_path), all addressed in `033_audit_fixes.sql`. The remaining
findings are historical non-idempotency that is accepted as-is because
the affected migrations are already applied.

---

## 1. Idempotency / re-runnability

### Accepted as-is (historical, already applied - do NOT rewrite)

- **001_schema.sql**
  - All `CREATE POLICY` statements run unguarded (no `DROP POLICY IF
    EXISTS` first, and Postgres has no `CREATE POLICY IF NOT EXISTS`).
    Re-running 001 errors on the first policy.
  - `CREATE INDEX idx_businesses_merchant`, `idx_places_city`,
    `idx_places_google`, `idx_challenges_*`, `idx_rewards_*`,
    `idx_completions_*`, `idx_redemptions_*` are all unguarded
    (`CREATE INDEX` without `IF NOT EXISTS`).
  - `CREATE TRIGGER set_profiles_updated_at`,
    `set_businesses_updated_at`, `set_challenges_updated_at` are
    unguarded (no `DROP TRIGGER IF EXISTS` first).
  - Tables themselves use `CREATE TABLE IF NOT EXISTS` (good).
  - Net: 001 is a one-shot bootstrap script and is NOT re-runnable. It
    has been applied once; leave it. Migrations 002+ already use the
    correct `IF NOT EXISTS` / `DROP ... IF EXISTS` patterns.

- **016_realtime_role_check.sql** contains stray non-ASCII bytes in its
  comment banners (they render as `????...`). They are inside SQL
  comments only, so they do not affect execution, and `supabase/*.sql`
  is not bundled by Turbopack so they are not a web-build risk. Left
  untouched to avoid desyncing the applied file; flagged here so a
  future cleanup pass knows the bytes are cosmetic.

### Good (idempotent) - representative

Migrations 002-015, 017-032 consistently use `ADD COLUMN IF NOT EXISTS`,
`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
`CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` before
`CREATE POLICY`, `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`, and
`DROP CONSTRAINT IF EXISTS` before `ADD CONSTRAINT`. The data backfills
(008, 017, 018, 019, 025, 031, 032) are idempotent / re-safe (guarded by
`WHERE ... IS NULL` predicates or pure de-dupe deletes).

---

## 2. RLS coverage

Every table in `public` has RLS enabled and at least one policy:

| Table | RLS | Notes |
|-------|-----|-------|
| profiles | yes | own row + admin via `current_user_role()` |
| businesses | yes | merchant-owns + admin + traveler-read-approved |
| places | yes | read-active + admin manage + merchant insert |
| challenges | yes | merchant-owns + admin + read-live |
| rewards | yes | merchant-owns + admin view + read-active |
| challenge_completions | yes | user own + merchant-of-challenge + admin |
| reward_redemptions | yes | user own + merchant-of-reward + admin |
| merchant_subscriptions | yes | merchant own + admin (004) |
| challenge_templates | yes | read-published + admin (004) |
| travel_challenges | yes | merchant-owns + admin + read-live (004) |
| xendit_invoices | yes | merchant own + admin (005) |
| notifications | yes | user own r/w + admin read; service-role writes (006) |
| travel_challenge_progress | yes | user own + merchant big-reward read/update (019/020) |

- All policies key on `auth.uid()`; no policy trusts a client-provided
  id.
- Role checks use either `auth.jwt()->'app_metadata'->>'role'` or the
  `public.current_user_role()` SECURITY DEFINER helper (016). No use of
  `user_metadata` for authorization anywhere.
- `notifications` intentionally has no end-user INSERT policy (server
  fan-out runs as service role) - correct.

No missing RLS or missing-policy gaps found.

---

## 3. Security

- **SECURITY DEFINER functions**: all pin `SET search_path = ''` -
  verified across handle_new_user, sync_role_to_app_metadata,
  refill_free_skips_if_due, consume_skip_token, grant_skip_from_ad,
  unread_notification_count, mark_notifications_read,
  sync_email_to_profile, protect_superadmin_role,
  enforce_superadmin_accounts, current_user_role, consume_quest_skip,
  touch_user_location, notify_nearby_travelers_of_quest,
  handle_travel_challenge_status_change,
  notify_user_of_unseen_nearby_quests. Good.

- **Non-definer helpers WITHOUT search_path** (fixed forward in 033):
  `set_updated_at()`, `skip_token_status(uuid)`,
  `merchant_is_open_now(uuid)`, `merchant_has_active_promotion(uuid)`.
  These run as the caller, so the exposure is lower than a definer
  function, but a mutable search_path is still flagged by the Supabase
  linter. All four schema-qualify their object references, so pinning
  `search_path = ''` is behaviour-preserving.

- **GRANT ... TO anon**: `merchant_is_open_now` and
  `merchant_has_active_promotion` are granted to `anon`. They are
  read-only boolean helpers backing the public recommendations feed -
  acceptable. `consume_quest_skip` (021) was correctly revoked from
  anon/PUBLIC in 022. `touch_user_location` and
  `notify_user_of_unseen_nearby_quests` are revoked from anon (028/029).
  No over-broad anon execute grants on mutating functions.

- **`recommended_challenges` view** (014): rebuilt with
  `security_invoker = false` and `GRANT SELECT ... TO anon`. This means
  the view runs with the owner's privileges and bypasses RLS so the
  anonymous public feed can read live challenges from approved
  businesses. This is an intentional product decision (the original
  001 used `security_invoker = on`, which returned NULL business joins
  for travelers; 014 deliberately switched it). Accepted as-is, but
  noted: the view exposes `merchant_id` and business coordinates to
  anonymous clients. If anon access is ever not required, revoke the
  anon grant or switch back to `security_invoker = true` with an
  appropriate traveler SELECT policy on `businesses` (which 014 also
  added). NOT changed here to avoid altering live public-feed
  behaviour.

- **Storage buckets**:
  - `challenge-proofs` (015) started public-read for `public`; 024
    correctly hardened it to `authenticated`-only SELECT and added a
    1 MB `file_size_limit`. Upload/update/delete are scoped to the
    owner's user-id folder (023 made the path comparison
    case-insensitive). Good.
  - `public-assets` (026) is intentionally public-read (quest cover
    art); writes restricted to merchant/admin/superadmin. Good.

---

## 4. Indexes for RLS / hot paths

Existing coverage is strong (001, 004, 017, 018, 019, 025, 028, 030 all
add targeted indexes). Two gaps found and fixed forward in 033:

- **`travel_challenge_progress.travel_challenge_id`** - used by the
  merchant big-reward SELECT/UPDATE policies (020) and the claim-code
  flow. The table's existing indexes lead with `user_id`, so a
  by-quest merchant scan had no usable index.
  -> `idx_travel_progress_travel_challenge`.

- **`xendit_invoices.merchant_id`** - used by the "Merchants read own
  invoices" RLS policy (005); only `xendit_id` was indexed.
  -> `idx_xendit_invoices_merchant`.

### Noted, not changed

- **Duplicate index on `travel_challenges.business_id`**:
  `idx_travel_challenges_business` (004) and
  `idx_travel_challenges_business_id` (013) are redundant. Dropping one
  is a safe, low-value cleanup but is a removal rather than an additive
  fix, so it is left out of 033. Recommendation: in a future
  maintenance migration, `DROP INDEX IF EXISTS public.idx_travel_challenges_business_id;`
  (keep the older 004 index).

---

## 5. Lock-in invariant ("one in-flight stop per quest")

The product rule is "a player works one stop at a time per quest". The
relevant facts:

- `challenge_completions` has `challenge_id` (the stop), not
  `travel_challenge_id` (the parent quest). The parent quest id lives on
  `challenges.travel_challenge_id`.
- Migration 025 added
  `idx_completions_one_active_per_challenge` - a partial UNIQUE index on
  `(user_id, challenge_id) WHERE completed_at IS NULL`. This enforces
  "one in-flight row per (user, STOP)", which is necessary but not
  sufficient for the per-QUEST rule.
- A true per-quest partial unique index is **not feasible** as a plain
  index: the uniqueness key (`travel_challenge_id`) lives on a different
  table (`challenges`), and a unique index cannot span a join. A
  generated/denormalized column plus a backfill would be required, which
  is out of scope for an additive audit fix.
- Therefore the per-quest invariant is enforced at the application layer
  in `src/app/v1/challenges/[id]/accept/route.ts`, and migration 032
  backfilled/cleaned up the historical duplicates that the older
  SELECT-then-INSERT race had left behind.

Conclusion: accepted as-is. No DB-level per-quest unique index is
created (it would not work). The app-level guard plus the per-stop
unique index (025) plus the 032 cleanup are the correct combination.

---

## What 033_audit_fixes.sql changes

Additive and idempotent; safe on a DB that already has 001-032:

1. `CREATE INDEX IF NOT EXISTS idx_travel_progress_travel_challenge`
   on `travel_challenge_progress(travel_challenge_id)`.
2. `CREATE INDEX IF NOT EXISTS idx_xendit_invoices_merchant`
   on `xendit_invoices(merchant_id)`.
3. `ALTER FUNCTION ... SET search_path = ''` for `set_updated_at()`,
   `skip_token_status(uuid)`, `merchant_is_open_now(uuid)`,
   `merchant_has_active_promotion(uuid)` - each guarded by a
   `to_regprocedure(...) IS NOT NULL` check so the migration never errors
   if a signature is absent.

---

## Accepted historical non-idempotency (fixed forward, not rewritten)

- 001_schema.sql: unguarded `CREATE POLICY`, `CREATE INDEX`, and
  `CREATE TRIGGER` statements (not re-runnable). Applied once; left as-is.
- 016_realtime_role_check.sql: cosmetic non-ASCII bytes in comment
  banners. Harmless; left as-is.
- Duplicate `business_id` index on `travel_challenges` (004 vs 013):
  left as-is; cleanup recommended but not additive.
- `recommended_challenges` view anon access via `security_invoker = false`
  (014): intentional public-feed behaviour; left as-is.
