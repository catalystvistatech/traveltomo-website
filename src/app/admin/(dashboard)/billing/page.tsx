import { getMerchantPlan } from "@/lib/actions/business";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { BillingView } from "./billing-view";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
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
