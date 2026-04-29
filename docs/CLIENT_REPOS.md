# Client repositories

**Last updated:** 2026-04-29

This note records where each **application** codebase lives and who owns it, separate from this repo (which holds the admin dashboard, Supabase migrations, and platform documentation).

## iOS app (client-owned)

| | |
|---|---|
| **Canonical remote** | [github.com/catalystvistatech/traveltomo-ios](https://github.com/catalystvistatech/traveltomo-ios) |
| **Role** | End-user iOS client (Swift / SwiftUI). Consumes the same Supabase schema and RLS as the web dashboard. |
| **Ownership** | Client-controlled repository. Milestone 1 is complete; ongoing iOS work is coordinated against that remote. |

Local clones may exist under other folder names (for example a legacy `TravelTomo/` path on a developer machine). Treat **catalystvistatech/traveltomo-ios** as the source of truth for the iOS app unless your team agrees otherwise.

## This repo (`traveltomo-website`)

Admin/merchant dashboard (Next.js), shared `supabase/` migrations, and `docs/` including [ARCHITECTURE.md](ARCHITECTURE.md).

## Web vs iOS

- **Backend contract:** PostgreSQL + RLS in Supabase (migrations here). No duplicate authorization logic in clients.
- **Schema changes:** Always migrate here first, then update clients (see ARCHITECTURE.md workflow).
