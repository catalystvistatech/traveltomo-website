import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description:
    "The rules for using TravelTomo: playing quests, collecting stamps and rewards, the Unlimited Pass subscription, and the business dashboard.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="October 24, 2026">
      <section>
        <p>
          These terms are an agreement between you and Catalyst Vista Tech (&ldquo;TravelTomo&rdquo;,
          &ldquo;we&rdquo;) for the TravelTomo app and the dashboard at traveltomo.app. By using TravelTomo you
          agree to them and to our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <ul>
          <li>Give accurate information and keep your sign-in details safe. You are responsible for activity on your account.</li>
          <li>You must be at least 13 to use TravelTomo. Some features, such as subscriptions, are only offered to users 18 and older.</li>
          <li>You can delete your account at any time in the app under Settings → Delete Account.</li>
        </ul>
      </section>

      <section>
        <h2>Playing fair</h2>
        <ul>
          <li>Quests, stops and stamp cards require you to really be at the place. Faking your location, submitting someone else&rsquo;s photo, or sharing codes to claim rewards you didn&rsquo;t earn is not allowed.</li>
          <li>We may cancel rewards, reset progress, or suspend accounts that break these rules or abuse the service.</li>
          <li>Be safe and respectful: follow local laws and the rules of the places you visit, and never put yourself or others at risk to complete a challenge.</li>
        </ul>
      </section>

      <section>
        <h2>Rewards, stamps and businesses</h2>
        <ul>
          <li>Rewards and freebies are offered by the participating businesses, not by TravelTomo. They are subject to availability, the business&rsquo;s own conditions, and any dates or limits shown.</li>
          <li>Rewards have no cash value and cannot be exchanged, transferred or sold.</li>
          <li>Quests and stamp cards run only between the dates the business sets and may end or change at any time.</li>
          <li>TravelTomo is not responsible for the products, services or conduct of the businesses you visit.</li>
        </ul>
      </section>

      <section>
        <h2>Unlimited Pass</h2>
        <ul>
          <li>The Unlimited Pass is an optional auto-renewing subscription sold through the App Store. Prices and any free trial are shown before you buy.</li>
          <li>Payment is charged to your Apple ID. It renews automatically unless cancelled at least 24 hours before the end of the current period; manage or cancel it in your Apple ID subscription settings.</li>
          <li>
            Refunds are handled by Apple. Apple&rsquo;s{" "}
            <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Standard End User License Agreement</a>{" "}
            also applies to the app.
          </li>
        </ul>
      </section>

      <section>
        <h2>For businesses</h2>
        <ul>
          <li>Give accurate business details, only list places you are allowed to promote, and honour the rewards you offer to travelers who earn them.</li>
          <li>Paid business plans are billed in advance through Stripe and renew until cancelled from the Billing page.</li>
          <li>We may review, pause or remove businesses, quests or stamp cards that are misleading, unsafe or break these terms.</li>
        </ul>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          You keep ownership of the photos and other content you submit. You give TravelTomo permission to store
          them and show them to the business you visited so they can verify your visit, and to run the service.
          Don&rsquo;t submit content that is illegal, offensive or that you don&rsquo;t have the right to share.
        </p>
      </section>

      <section>
        <h2>The service</h2>
        <p>
          TravelTomo is provided &ldquo;as is&rdquo;. Maps, place details, opening hours and distances come
          partly from third parties and may be inaccurate — check before you travel. To the extent the law
          allows, we are not liable for indirect or consequential losses, and our total liability is limited to
          the amount you paid us in the last 12 months.
        </p>
      </section>

      <section>
        <h2>Changes, law and contact</h2>
        <p>
          We may update these terms; we will post changes here and update the date above. These terms are
          governed by the laws of the Republic of the Philippines. Questions? Email{" "}
          <a href="mailto:info@traveltomo.app">info@traveltomo.app</a>.
        </p>
      </section>
    </LegalPage>
  );
}
