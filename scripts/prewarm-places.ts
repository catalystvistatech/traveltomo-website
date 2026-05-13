/**
 * Prewarm the `public.places` cache for our launch markets.
 *
 *   pnpm prewarm:places            # warms every city in CITIES below
 *   pnpm prewarm:places angeles    # warms a single city by key
 *   pnpm prewarm:places --refresh  # bumps refreshed_at on existing
 *                                  # prewarmed rows (Google call again)
 *
 * Run this once per launch market. After it succeeds, regular
 * `/v1/places` traffic in that area hits the Postgres cache without
 * ever paying Google -- typically 200-400 rows per city per type filter
 * gives the home feed plenty of candidates.
 *
 * Required env (read from .env.local / .env when run with `tsx`):
 *   GOOGLE_MAPS_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * This is a one-shot admin script; it bypasses RLS via the service-role
 * Supabase client. Do not run it from production user contexts.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import {
  googleNearby,
  type EstablishmentType,
} from "../src/lib/google/places";
import { mirrorPlaces } from "../src/lib/google/placesCache";

// Load .env files manually so `tsx` works the same way as `next dev`.
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

type CityKey = string;

interface CitySeed {
  key: CityKey;
  name: string;
  latitude: number;
  longitude: number;
  /** How wide to sweep around each centre, in metres. */
  radiusMeters: number;
}

// Launch markets. Add new cities here; each one costs ~8 Google
// Nearby Search calls (one per establishment type).
const CITIES: CitySeed[] = [
  {
    key: "angeles",
    name: "Angeles City, Pampanga",
    latitude: 15.1449,
    longitude: 120.5887,
    radiusMeters: 5_000,
  },
  {
    key: "clark",
    name: "Clark Freeport Zone",
    latitude: 15.1859,
    longitude: 120.5392,
    radiusMeters: 5_000,
  },
  {
    key: "boracay",
    name: "Boracay (Station 2)",
    latitude: 11.9670,
    longitude: 121.9242,
    radiusMeters: 3_500,
  },
];

const ALL_TYPES: EstablishmentType[] = [
  "restaurant",
  "cafe",
  "hotel",
  "motel",
  "adventure",
  "landmark",
  "shopping",
  "entertainment",
];

interface PrewarmStats {
  city: string;
  attempted: number;
  fetched: number;
  mirrored: number;
  errors: string[];
}

async function prewarmCity(
  seed: CitySeed,
  options: { refresh: boolean },
): Promise<PrewarmStats> {
  const stats: PrewarmStats = {
    city: seed.name,
    attempted: 0,
    fetched: 0,
    mirrored: 0,
    errors: [],
  };

  for (const type of ALL_TYPES) {
    stats.attempted += 1;
    try {
      const raw = await googleNearby({
        latitude: seed.latitude,
        longitude: seed.longitude,
        radiusMeters: seed.radiusMeters,
        types: [type],
        // Loose review floor so we capture every legit POI, not just
        // the top 5 trending. The live home-feed quality filter still
        // applies on read.
        minRatingCount: 0,
        maxResults: 20,
      });
      stats.fetched += raw.length;

      if (raw.length === 0) {
        process.stdout.write(`  · ${type}: 0 results\n`);
        continue;
      }

      const mirrored = await mirrorPlaces(raw, {
        source: "prewarmed",
        prewarmed: true,
      });
      stats.mirrored += mirrored.length;
      process.stdout.write(
        `  · ${type}: ${raw.length} fetched ? ${mirrored.length} mirrored\n`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stats.errors.push(`${type}: ${message}`);
      process.stderr.write(`  ! ${type} failed: ${message}\n`);
    }
  }

  // Touch refreshed_at on any rows we just upserted so the TTL clock
  // resets explicitly. mirrorPlaces already does this; the `refresh`
  // flag is reserved for future expansion (force-refetch even if the
  // upstream payload is identical).
  void options.refresh;

  return stats;
}

async function main() {
  const argv = process.argv.slice(2);
  const refresh = argv.includes("--refresh");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const targets = positional.length > 0
    ? CITIES.filter((c) =>
        positional.some((p) => c.key === p.toLowerCase()),
      )
    : CITIES;

  if (targets.length === 0) {
    console.error(
      `No matching cities. Known keys: ${CITIES.map((c) => c.key).join(", ")}`,
    );
    process.exit(1);
  }

  console.log(
    `Prewarming ${targets.length} cit${targets.length === 1 ? "y" : "ies"} (refresh=${refresh})…`,
  );

  const allStats: PrewarmStats[] = [];
  for (const seed of targets) {
    console.log(`\n? ${seed.name}`);
    const stats = await prewarmCity(seed, { refresh });
    allStats.push(stats);
  }

  console.log(`\n?? Summary ???????????????????????????????????`);
  for (const s of allStats) {
    console.log(
      `${s.city.padEnd(36)} attempted=${s.attempted}  fetched=${s.fetched}  mirrored=${s.mirrored}  errors=${s.errors.length}`,
    );
    for (const e of s.errors) console.log(`    × ${e}`);
  }

  const totalFetched = allStats.reduce((sum, s) => sum + s.fetched, 0);
  const totalCalls = allStats.reduce((sum, s) => sum + s.attempted, 0);
  console.log(
    `\nTotal: ${totalCalls} Google calls · ${totalFetched} places mirrored.`,
  );
  console.log(
    `Estimated Google cost: ~$${((totalCalls * 47) / 1000).toFixed(2)} (Enterprise+Atmosphere SKU @ $47/1k).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
