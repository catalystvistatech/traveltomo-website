# TravelTomo Admin Dashboard

Admin and merchant dashboard for the TravelTomo platform. Merchants create challenges, set rewards, and generate QR codes. Admins approve challenges and manage the ecosystem.

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions)
- **TypeScript** (strict)
- **Tailwind CSS v4** + **shadcn/ui v4**
- **Supabase** (Auth with PKCE, PostgreSQL with RLS, Storage)
- **Zod** (server-side validation)
- **Deployed on Vercel**

## Getting Started

```bash
# Install dependencies
npm install

# Copy env template and fill in your Supabase keys
cp .env.local.example .env.local

# Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Scope | Where to Find |
|----------|-------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Supabase Dashboard > Settings > API (reveal) |

## Database Setup

Run `supabase/001_schema.sql` in the Supabase SQL Editor to create all tables, RLS policies, and triggers.

## Merchant Flow

1. Register / Login
2. Complete business profile
3. Create challenge (5-step wizard: details, verification, reward, QR, review)
4. Submit for review
5. Admin approves -> challenge goes live
6. Monitor completions and redemptions

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full platform architecture, schema design, security model, and decision log.

## Related Repos

| Repo | Description |
|------|-------------|
| `TravelTomo/` | iOS app (Swift/SwiftUI) |
| `traveltomo-website/` | This repo (admin dashboard) |
| Android (future) | Kotlin/Compose app |

All clients share the same Supabase backend.
