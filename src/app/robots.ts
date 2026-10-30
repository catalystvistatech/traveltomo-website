import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Public marketing, help and legal pages are crawlable. The dashboard and the
// app's JSON API are blocked. Per-merchant stamp QR pages (/s/<code>) stay
// crawlable on purpose: they carry a `noindex` robots meta tag, which crawlers
// can only see if they are allowed to fetch the page.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/v1"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
