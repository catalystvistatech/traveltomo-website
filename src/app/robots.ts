import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.traveltomo.app";

// Public marketing + legal pages are indexable; the dashboard, API and
// per-QR stamp pages are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/v1", "/s/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
