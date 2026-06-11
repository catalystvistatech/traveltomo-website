import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help & Support — TravelTomo",
  description:
    "Answers to common questions about playing TravelTomo, claiming rewards, the Unlimited Pass, and getting in touch.",
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I play?",
    a: "Roll the dice to get your next stop, follow the route to the location, then complete the challenge (photo, GPS check-in, QR scan, or quiz) to earn your reward.",
  },
  {
    q: "How do I claim a reward?",
    a: "After you finish a challenge you get a QR code. Show it to the staff at the partner business to redeem your discount or freebie.",
  },
  {
    q: "What are skips?",
    a: "If you do not like the stop you rolled, you can skip and re-roll for a different one. On the free plan a short ad plays before each re-roll.",
  },
  {
    q: "What does the Unlimited Pass give me?",
    a: "No ads, unlimited access to guides and maps, and more perks. You can subscribe from onboarding or your profile.",
  },
  {
    q: "Why did a challenge disappear?",
    a: "Challenges are time-boxed by the merchant. Once a quest's dates pass it expires and leaves the list. Finished stops stay marked as claimed.",
  },
  {
    q: "How do I change my photo or avatar?",
    a: "In the app, open Settings then Edit Profile. Your profile photo is used when set; otherwise your avatar is shown.",
  },
  {
    q: "I'm a business — how do I create challenges?",
    a: "Register as a merchant on the dashboard, build a challenge with rewards using the guided wizard, and submit it for approval. Once approved it goes live for travelers.",
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
          ? Back to TravelTomo
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
