"use server";

// Quest wizard: create a publishable quest from three answers — the rewards,
// a set of nearby places, and a confirm — instead of ~60 form fields.
//
// Everything that writes goes through the existing actions
// (createTravelChallenge, addChildChallenge, submitTravelChallengeForReview),
// so ownership checks, act-as scoping and audit logging apply unchanged. This
// module only picks sensible defaults and fills them in.

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveMerchantScope, scopeAllowsWrite, type MerchantScope } from "@/lib/actions/scope";
import { effectiveServiceRadius } from "@/lib/constants/service-radius";
import {
  ESTABLISHMENT_TYPES,
  TRAVEL_CHALLENGE_STOP_COUNT,
} from "@/lib/validations/marketplace";
import {
  addChildChallenge,
  createTravelChallenge,
  submitTravelChallengeForReview,
} from "@/lib/actions/travelChallenges";

type EstablishmentType = (typeof ESTABLISHMENT_TYPES)[number];

export type WizardPlace = {
  id: string;
  name: string;
  category: string | null;
  imageUrl: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  isOwnBusiness: boolean;
};

/**
 * Places that would make a poor quest stop: sending travelers on a photo
 * hunt to a clinic, school or someone's apartment block is inappropriate,
 * so these never appear in the picker.
 */
const UNSUITABLE_CATEGORY =
  /clinic|hospital|medical|pharmacy|dentist|school|university|college|government|office|apartment|housing|condominium|guest room|finance|bank|atm|association|organization|business center|transportation|embassy|police|funeral|cemetery/i;

/** Maps a free-text place category onto the app's establishment types. */
function toEstablishmentType(category: string | null): EstablishmentType {
  const c = (category ?? "").toLowerCase();
  if (/coffee|cafe|café|tea house|milk tea/.test(c)) return "cafe";
  if (/bar|pub|brewery|night ?club/.test(c)) return "bar";
  if (/restaurant|food|bakery|eatery|diner|grill/.test(c)) return "restaurant";
  if (/motel/.test(c)) return "motel";
  if (/hotel|resort|inn|hostel|guest house|lodge/.test(c)) return "hotel";
  if (/spa|massage|salon|wellness/.test(c)) return "spa";
  if (/zoo|aquarium|farm|animal/.test(c)) return "animal_themed";
  if (/store|mall|market|shop|boutique|supermarket/.test(c)) return "shop";
  if (/park|nature|campground|museum|historic|landmark|beach|falls|lake|entertainment|attraction|tourist|church|shrine|viewpoint/.test(c)) {
    return "adventure";
  }
  return "other";
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

type LoadedBusiness = {
  id: string;
  merchant_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  service_radius_meters: number | null;
};

/**
 * Loads a business the caller may build quests for. Mirrors
 * createTravelChallenge: the business must belong to the current merchant
 * scope (the merchant themself, or the merchant a superadmin is acting as).
 * Verification is left to createTravelChallenge, which owns the superadmin
 * bypass for it.
 */
async function loadBusinessForCaller(
  businessId: string
): Promise<{ business: LoadedBusiness; scope: MerchantScope } | { error: string }> {
  const scope = await resolveMerchantScope();
  if (!scope) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, merchant_id, name, latitude, longitude, service_radius_meters")
    .eq("id", businessId)
    .eq("merchant_id", scope.merchantId)
    .maybeSingle();
  if (!business) return { error: "That business doesn't belong to you." };
  if (business.latitude == null || business.longitude == null) {
    return { error: "Add this business's location on the Profile page first." };
  }
  return { business: business as LoadedBusiness, scope };
}

async function placesAround(business: LoadedBusiness): Promise<WizardPlace[]> {
  const lat = business.latitude as number;
  const lng = business.longitude as number;
  const radius = effectiveServiceRadius(business.service_radius_meters);

  // Bounding box first (cheap, indexable), exact distance in JS after.
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));

  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select("id, name, category, image_url, latitude, longitude, business_id")
    .eq("is_active", true)
    .gte("latitude", lat - dLat)
    .lte("latitude", lat + dLat)
    .gte("longitude", lng - dLng)
    .lte("longitude", lng + dLng)
    .limit(400);

  return (data ?? [])
    .flatMap((p) => {
      if (p.latitude == null || p.longitude == null) return [];
      if (UNSUITABLE_CATEGORY.test(p.category ?? "")) return [];
      const distanceMeters = haversineMeters(lat, lng, p.latitude, p.longitude);
      if (distanceMeters > radius) return [];
      return [
        {
          id: p.id as string,
          name: p.name as string,
          category: (p.category as string | null) ?? null,
          imageUrl: (p.image_url as string | null) ?? null,
          latitude: p.latitude as number,
          longitude: p.longitude as number,
          distanceMeters: Math.round(distanceMeters),
          isOwnBusiness: p.business_id === business.id,
        },
      ];
    })
    .sort((a, b) => {
      // The merchant's own venue first, then places with photos (they make
      // far better cards in the app), then nearest.
      if (a.isOwnBusiness !== b.isOwnBusiness) return a.isOwnBusiness ? -1 : 1;
      if (!!a.imageUrl !== !!b.imageUrl) return a.imageUrl ? -1 : 1;
      return a.distanceMeters - b.distanceMeters;
    });
}

/** Nearby places the merchant can tap to use as quest stops. */
export async function listWizardPlaces(
  businessId: string
): Promise<{ places: WizardPlace[]; radiusMeters: number } | { error: string }> {
  const loaded = await loadBusinessForCaller(businessId);
  if ("error" in loaded) return loaded;
  const places = await placesAround(loaded.business);
  return {
    places: places.slice(0, 60),
    radiusMeters: effectiveServiceRadius(loaded.business.service_radius_meters),
  };
}

const rewardSchema = z.object({
  title: z.string().trim().min(3, "Reward needs at least 3 characters").max(100, "Reward is too long"),
  type: z.enum(["freebie", "percentage", "fixed"]).default("freebie"),
  value: z.coerce.number().min(0).optional(),
});

const wizardSchema = z.object({
  businessId: z.string().uuid("Pick a business"),
  title: z.string().trim().min(3, "Quest name needs at least 3 characters").max(120, "Quest name is too long"),
  stopReward: rewardSchema,
  bigReward: rewardSchema,
  placeIds: z
    .array(z.string().uuid())
    .length(TRAVEL_CHALLENGE_STOP_COUNT, `Pick exactly ${TRAVEL_CHALLENGE_STOP_COUNT} places`)
    .refine((ids) => new Set(ids).size === ids.length, "Each place can only be used once"),
});

export type WizardInput = z.input<typeof wizardSchema>;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function firstError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    for (const v of Object.values(err as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length) return String(v[0]);
      if (typeof v === "string") return v;
    }
  }
  return "Something went wrong. Please try again.";
}

/**
 * Creates and publishes a quest from the wizard's answers.
 *
 * On a partial failure the quest is left as a DRAFT with the stops that did
 * get created, and its id is returned so the merchant can finish in the
 * regular editor — nothing is half-published.
 */
export async function createQuestWithWizard(
  input: WizardInput
): Promise<
  | { success: true; id: string }
  | { error: string; id?: string }
> {
  const parsed = wizardSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? "Please check your answers." };
  }
  const { businessId, title, stopReward, bigReward, placeIds } = parsed.data;

  const loaded = await loadBusinessForCaller(businessId);
  if ("error" in loaded) return loaded;
  if (!scopeAllowsWrite(loaded.scope)) {
    return { error: "You're viewing this merchant read-only, so you can't create quests." };
  }

  // Never trust client-sent places: re-derive them server-side and require
  // every pick to still be an allowed place inside this business's area.
  const allowed = new Map((await placesAround(loaded.business)).map((p) => [p.id, p]));
  const places = placeIds.map((id) => allowed.get(id));
  if (places.some((p) => !p)) {
    return { error: "One of the picked places is no longer available. Please pick again." };
  }

  const today = new Date();
  const created = await createTravelChallenge({
    title,
    business_id: businessId,
    description: `Visit ${TRAVEL_CHALLENGE_STOP_COUNT} places around ${loaded.business.name} and earn rewards along the way.`,
    completion_mode: "all",
    date_range_start: isoDate(today),
    date_range_end: isoDate(new Date(today.getTime() + 30 * 86_400_000)),
    big_reward_source: "custom",
    big_reward_title: bigReward.title,
    big_reward_description: "Finish every stop, then show your QR code to claim.",
    big_reward_discount_type: bigReward.type,
    big_reward_discount_value: bigReward.type === "freebie" ? undefined : bigReward.value,
  });
  if ("error" in created) return { error: firstError(created.error) };
  const questId = created.id as string;

  for (const place of places as WizardPlace[]) {
    const r = await addChildChallenge(questId, {
      title: `Visit ${place.name}`.slice(0, 120),
      description: `Snap a photo at ${place.name} to prove you were there.`.slice(0, 500),
      type: "photo",
      verification_type: "photo_upload",
      establishment_type: toEstablishmentType(place.category),
      xp_reward: 50,
      radius_meters: 100,
      latitude: place.latitude,
      longitude: place.longitude,
      reward_title: stopReward.title,
      reward_description: "Show your QR code at the counter to claim.",
      reward_discount_type: stopReward.type,
      reward_discount_value: stopReward.type === "freebie" ? undefined : stopReward.value,
    });
    if ("error" in r) {
      return {
        error: `The quest was saved as a draft, but "${place.name}" couldn't be added (${firstError(r.error)}). Open it to finish.`,
        id: questId,
      };
    }
  }

  const published = await submitTravelChallengeForReview(questId);
  if ("error" in published) {
    return {
      error: `All stops were added, but publishing failed (${firstError(published.error)}). Open the quest to publish it.`,
      id: questId,
    };
  }

  return { success: true, id: questId };
}
