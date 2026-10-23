import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help & Support",
  description:
    "Answers to common questions about playing TravelTomo, claiming rewards, the Unlimited Pass, and getting in touch.",
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I play?",
    a: "Roll the dice to get your next stop, follow the route to the location, then check in there (a photo or a GPS check-in) to earn your reward.",
  },
  {
    q: "How do I claim a reward?",
    a: "After you finish a stop you get a short code. Show it to the staff at the business running the quest and they'll hand over your discount or freebie.",
  },
  {
    q: "What are skips?",
    a: "If you do not like the stop you rolled, you can skip and re-roll for a different one. You get 3 skips every 3 hours; on the free plan a short ad may play first.",
  },
  {
    q: "What does the Unlimited Pass give me?",
    a: "No ads and unlimited skips. You can subscribe when you first set up the app, or from Settings.",
  },
  {
    q: "Why did a challenge disappear?",
    a: "Quests run between dates the business chooses. After the last day the quest ends and leaves the list. Rewards you already earned stay in My Rewards.",
  },
  {
    q: "How do stamp cards work?",
    a: "Some shops have a TravelTomo QR at the counter. Open the app, tap Stamps, then Scan — you get one stamp per visit. Fill the card and you get a freebie code to show the staff.",
  },
  {
    q: "How do I change my photo or avatar?",
    a: "In the app, open Settings then Edit Profile. Your profile photo is used when set; otherwise your avatar is shown.",
  },
  {
    q: "How do I delete my account?",
    a: "In the app, open Settings and tap Delete Account. This permanently removes your profile and activity. You can also email us and we'll do it for you.",
  },
  {
    q: "I'm a business — how do I get started?",
    a: "Register as a merchant on the dashboard. Once your business is verified, tap \"Make a quest\": pick your rewards, tap 6 places near you, and publish — it goes live right away. You can also set up a Stamp Card so regulars earn a freebie every few visits.",
  },
];

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/"
          className="text-sm text-zinc-400 hover:text-white transition-colors"
        >
          ← Back to TravelTomo
        </Link>

        <h1 className="mt-8 text-4xl font-bold tracking-tight">
          Help &amp; Support
        </h1>
        <p className="mt-3 text-zinc-400">
          Quick answers to the most common questions. Still stuck? Reach us
          anytime at{" "}
          <a
            href="mailto:info@traveltomo.app"
            className="text-[#FCA581] hover:underline"
          >
            info@traveltomo.app
          </a>
          .
        </p>

        <div className="mt-10 space-y-4">
          {FAQS.map((item) => (
            <div
              key={item.q}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6"
            >
              <h2 className="text-lg font-semibold">{item.q}</h2>
              <p className="mt-2 text-zinc-400 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
          <h2 className="text-xl font-semibold">Still need help?</h2>
          <p className="mt-2 text-zinc-400">
            Our team is happy to help with anything else.
          </p>
          <a
            href="mailto:info@traveltomo.app"
            className="mt-5 inline-flex items-center justify-center rounded-full bg-[#D12D34] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#b3262c]"
          >
            Email us
          </a>
        </div>

        <p className="mt-12 text-center text-sm text-zinc-600">
          Explore. Play. Earn. Repeat.
        </p>
      </div>
    </main>
  );
}
