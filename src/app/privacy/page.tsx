import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "How TravelTomo collects, uses and protects your information — location, photos, account details and purchases — and how to delete your account.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 24, 2026">
      <section>
        <p>
          TravelTomo (&ldquo;TravelTomo&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is operated by Catalyst Vista
          Tech in the Philippines. This policy explains what information the TravelTomo app and the business
          dashboard at traveltomo.app collect, why, who we share it with, and the choices you have. It is
          written to comply with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).
        </p>
      </section>

      <section>
        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Account details</strong> — your name or nickname, email address and password, or the
            identifier Apple or Google gives us when you use Sign in with Apple or Google.
          </li>
          <li>
            <strong>Profile</strong> — your avatar or profile photo, whether you are 18 or older, travel
            preferences and the dates of your stay, if you choose to give them.
          </li>
          <li>
            <strong>Location</strong> — your device&rsquo;s precise location while you use the app, to show
            nearby places and quests, confirm you are at a stop or shop when you check in or collect a stamp,
            and let you know about new quests near where you were last.
          </li>
          <li>
            <strong>Photos</strong> — pictures you take or choose as proof that you visited a stop. We only
            access the photos you pick.
          </li>
          <li>
            <strong>Activity</strong> — quests you start, stops you complete, stamps, rewards and reward codes,
            experience points, skips and notifications.
          </li>
          <li>
            <strong>Purchases</strong> — whether you have an active Unlimited Pass. Payments are handled by
            Apple; we never receive your card details.
          </li>
          <li>
            <strong>Advertising data</strong> — the free version shows ads from Google AdMob. AdMob may collect
            device and advertising identifiers. On iPhone, your advertising identifier is only used for
            personalised ads if you allow tracking when asked; you can play without allowing it.
          </li>
          <li>
            <strong>Businesses using the dashboard</strong> — business name, address, map location, opening
            hours, contact details and, for paid plans, billing details handled by Stripe.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To run the game: show quests and places near you, track your progress, and issue rewards.</li>
          <li>To confirm real visits and prevent cheating, for example checking you are near a shop before giving a stamp.</li>
          <li>To send notifications you can turn off, such as when a reward is ready or a quest opens near you.</li>
          <li>To provide the Unlimited Pass and, on the free version, to show ads.</li>
          <li>To answer support requests, keep the service secure, and improve it.</li>
        </ul>
        <p className="mt-3">We do not sell your personal information.</p>
      </section>

      <section>
        <h2>Who we share it with</h2>
        <ul>
          <li>
            <strong>Businesses you visit</strong> — when you complete a stop or claim a reward, that business
            sees your display name, the proof photo you submitted and your reward code, so they can verify and
            honour it.
          </li>
          <li>
            <strong>Service providers</strong> that run TravelTomo for us: Supabase (database, sign-in and file
            storage), Vercel (website and API hosting), Google (Maps and Places, Google sign-in, AdMob ads),
            Apple (Sign in with Apple, App Store payments) and Stripe (business billing). They may only use the
            information to provide their service to us.
          </li>
          <li>When required by law, or to protect the rights and safety of our users and the public.</li>
        </ul>
      </section>

      <section>
        <h2>Where your data is stored</h2>
        <p>
          Our database and servers are hosted by Supabase and Vercel, primarily in Japan. By using TravelTomo
          you understand your information may be processed outside the Philippines, with safeguards consistent
          with this policy.
        </p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <p>
          We keep your information while your account is active. You can delete your account at any time in the
          app under <strong>Settings → Delete Account</strong>, or by emailing us. Deleting your account removes
          your profile and activity; we may keep limited records where the law requires it.
        </p>
      </section>

      <section>
        <h2>Your rights and choices</h2>
        <ul>
          <li>Access, correct or download the personal information we hold about you.</li>
          <li>Delete your account and data, or object to how it is used.</li>
          <li>Turn off location, camera, photos, notifications or tracking at any time in your phone&rsquo;s settings.</li>
          <li>
            Complain to the National Privacy Commission (privacy.gov.ph) if you believe your data was mishandled.
          </li>
        </ul>
        <p className="mt-3">
          To use any of these rights, email <a href="mailto:info@traveltomo.app">info@traveltomo.app</a>.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          TravelTomo is not directed to children under 13, and we do not knowingly collect their information.
          If you believe a child has given us information, contact us and we will delete it.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          We use encryption in transit, access controls and row-level security in our database. No system is
          perfectly secure, but we work to protect your information and will notify you and the authorities of
          a breach as the law requires.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We will post updates to this page and change the date above. For questions, contact Catalyst Vista
          Tech at <a href="mailto:info@traveltomo.app">info@traveltomo.app</a>.
        </p>
      </section>
    </LegalPage>
  );
}
