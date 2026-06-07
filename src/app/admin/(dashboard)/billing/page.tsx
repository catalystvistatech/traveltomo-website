import { getMerchantPlan } from "@/lib/actions/business";
import { getCurrentUser } from "@/lib/actions/auth";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { BillingView } from "./billing-view";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUser();

  // Plans gate how many businesses a merchant can run. Admins & superadmins
  // are uncapped platform staff, so billing simply doesn't apply to them.
  if (user && (user.role === "admin" || user.role === "superadmin")) {
    return (
      <div className="max-w-2xl space-y-3">
        <h1 className="text-2xl font-bold text-white">Billing &amp; Plan</h1>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 text-sm text-zinc-400">
          Plans apply to merchant accounts. Your{" "}
          <span className="capitalize text-zinc-200">{user.role}</span> account
          has unlimited businesses, so there&apos;s nothing to bill.
        </div>
      </div>
    );
  }

  const [plan, params] = await Promise.all([getMerchantPlan(), searchParams]);

  return (
    <BillingView
      currentPlan={plan.planCode}
      used={plan.used}
      businessLimit={plan.businessLimit}
      stripeConfigured={isStripeConfigured()}
      status={params?.status}
    />
  );
}
