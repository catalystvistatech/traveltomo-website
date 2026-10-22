import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseStampCode } from "@/lib/stamps";

// Public landing page for a printed stamp-card QR. Scanned with the phone's
// camera (not the app) it explains the card and sends the traveler to the
// app: "Open in TravelTomo" if installed, otherwise the App Store.

export const metadata: Metadata = {
  title: "Collect a stamp — TravelTomo",
  robots: { index: false },
};

const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL ?? null;

export default async function StampLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = parseStampCode(decodeURIComponent(raw));

  const card = code
    ? (
        await createAdminClient()
          .from("stamp_cards")
          .select("title, stamps_required, reward_title, status, ends_at, business:businesses ( name, logo_url )")
          .eq("qr_code_value", code)
          .maybeSingle()
      ).data
    : null;

  const business = (card?.business as unknown as { name?: string; logo_url?: string | null } | null) ?? null;
  const ended = !card || card.status !== "active" || (card.ends_at != null && new Date(card.ends_at) <= new Date());

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 py-10 text-white">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-2xl font-bold">T</div>
        {card ? (
          <>
            <div className="space-y-1">
              <p className="text-sm text-zinc-400">{business?.name}</p>
              <h1 className="text-2xl font-bold">{card.title}</h1>
            </div>
            <div className="flex flex-wrap justify-center gap-2" aria-hidden>
              {Array.from({ length: card.stamps_required }).map((_, i) => (
                <span key={i} className="h-9 w-9 rounded-full border-2 border-dashed border-zinc-600" />
              ))}
            </div>
            <p className="text-zinc-300">
              Collect {card.stamps_required} stamps here and get{" "}
              <span className="font-semibold text-white">{card.reward_title}</span> free.
            </p>
            {ended && <p className="text-sm text-amber-400">This stamp card isn&apos;t running right now.</p>}
          </>
        ) : (
          <h1 className="text-xl font-bold">This QR isn&apos;t a TravelTomo stamp card.</h1>
        )}

        <div className="space-y-3">
          {code && !ended && (
            <a
              href={`traveltomo://stamp?code=${encodeURIComponent(code)}`}
              className="block rounded-xl bg-red-600 py-3 font-semibold hover:bg-red-700"
            >
              Open in TravelTomo
            </a>
          )}
          {APP_STORE_URL ? (
            <a href={APP_STORE_URL} className="block rounded-xl border border-zinc-700 py-3 font-semibold hover:bg-zinc-800">
              Get TravelTomo on the App Store
            </a>
          ) : (
            <p className="text-sm text-zinc-400">TravelTomo is coming soon to the App Store.</p>
          )}
          <p className="text-xs text-zinc-500">
            Already have the app? Open it, tap the menu, then <span className="text-zinc-300">Stamps → Scan</span>.
          </p>
        </div>
      </div>
    </main>
  );
}
