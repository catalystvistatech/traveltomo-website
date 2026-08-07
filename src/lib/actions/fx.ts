"use server";

// Fetches PHP-based exchange rates for display-only currency conversion on the
// Promote page. Uses a free, no-key endpoint and lets Next cache the response
// for 6 hours so we don't hit it on every page view. Returns null on any
// failure so the UI degrades gracefully to PHP-only display.
export async function getPhpFxRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/PHP", {
      next: { revalidate: 21600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number> };
    return data.rates ?? null;
  } catch {
    return null;
  }
}
