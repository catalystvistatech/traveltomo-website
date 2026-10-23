// Maps a free-text Google Places category ("Coffee shop", "Seafood
// restaurant", "Resort hotel") onto the app's establishment types. Used to
// pre-fill a business's type and a quest stop's type from Google data.

import { ESTABLISHMENT_TYPES } from "@/lib/validations/marketplace";

export type EstablishmentType = (typeof ESTABLISHMENT_TYPES)[number];

export function establishmentTypeFromCategory(category: string | null | undefined): EstablishmentType {
  const c = (category ?? "").toLowerCase();
  if (/coffee|cafe|café|tea house|milk tea/.test(c)) return "cafe";
  if (/\bbar\b|\bpub\b|brewery|night ?club|lounge/.test(c)) return "bar";
  if (/restaurant|food|bakery|eatery|diner|grill|kitchen|bistro/.test(c)) return "restaurant";
  if (/motel/.test(c)) return "motel";
  if (/hotel|resort|\binn\b|hostel|guest house|lodge/.test(c)) return "hotel";
  if (/\bspa\b|massage|salon|wellness/.test(c)) return "spa";
  if (/\bzoo\b|aquarium|farm|animal/.test(c)) return "animal_themed";
  if (/store|mall|market|shop|boutique|supermarket/.test(c)) return "shop";
  if (/park|nature|campground|museum|historic|landmark|beach|falls|lake|entertainment|attraction|tourist|church|shrine|viewpoint/.test(c)) {
    return "adventure";
  }
  return "other";
}
