// Shared values for the public site's metadata, sitemap, robots and JSON-LD.

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.traveltomo.app").replace(/\/+$/, "");

export const SITE_NAME = "TravelTomo";
export const APP_NAME = "Travel Tomo PH";
export const COMPANY_NAME = "Catalyst Vista Tech";
export const CONTACT_EMAIL = "info@traveltomo.app";

export const DEFAULT_TITLE = "TravelTomo — Gamified Travel Quests & Rewards in the Philippines";
export const DEFAULT_DESCRIPTION =
  "TravelTomo turns travel in the Philippines into a game: roll the dice, visit local spots, complete quests and collect digital stamp cards to earn free food, drinks and discounts from local businesses. Free on iOS.";

// The public App Store listing. Set NEXT_PUBLIC_APP_STORE_URL once the
// listing URL is known; until then structured data omits it and the
// download buttons keep pointing at the TestFlight beta.
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL || null;
export const TESTFLIGHT_URL = "https://testflight.apple.com/join/TzqkgSue";
export const DOWNLOAD_URL = APP_STORE_URL ?? TESTFLIGHT_URL;

/** The numeric App Store id (`id1234567890` in the listing URL), if known. */
export const APP_STORE_ID = APP_STORE_URL?.match(/\/id(\d+)/)?.[1] ?? null;

/** Serialises JSON-LD for a <script> tag without allowing `</script>` breakouts. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** The site-wide share card served by app/opengraph-image.tsx. */
export const SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "TravelTomo — gamified travel quests and rewards in the Philippines",
};

/**
 * Metadata for a public page: title, description, self-referencing canonical
 * and matching Open Graph / Twitter fields. A page that sets `openGraph`
 * replaces the root layout's object wholesale (including the image generated
 * by app/opengraph-image.tsx), so the shared fields and the image are
 * repeated here.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  const fullTitle = `${title} — ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website" as const,
      siteName: SITE_NAME,
      locale: "en_PH",
      title: fullTitle,
      description,
      url: path,
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: fullTitle,
      description,
      images: [SHARE_IMAGE],
    },
  };
}
