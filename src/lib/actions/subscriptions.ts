"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { subscriptionSchema } from "@/lib/validations/marketplace";
import { createInvoice, isMockMode } from "@/lib/payments/xendit";
import { revalidatePath } from "next/cache";

const TIER_PRICES_CENTS: Record<"basic" | "featured" | "premium", number> = {
  basic: 9900,
  featured: 29900,
  premium: 79900,
};

export async function getActiveSubscription() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("merchant_subscriptions")
    .select("*")
    .eq("merchant_id", user.id)
    .eq("status", "active")
    .gte("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function listSubscriptionHistory() {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("merchant_subscriptions")
    .select("*")
    .eq("merchant_id", user.id)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function startSubscription(input: unknown) {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const user = await getCurrentUser();
  if (!user) return { error: { _form: ["Not authenticated"] } };
  if (user.role !== "merchant" && user.role !== "admin" && user.role !== "superadmin") {
    return { error: { _form: ["Merchant access required"] } };
  }

  const supabase = await createClient();
  const endsAt = new Date();
  endsAt.setUTCMonth(endsAt.getUTCMonth() + parsed.data.months);

  const amountCents = TIER_PRICES_CENTS[parsed.data.tier] * parsed.data.months;

  const externalId = `sub-${user.id}-${Date.now()}`;
  const invoice = await createInvoice({
    externalId,
    amount: amountCents / 100,
    currency: "PHP",
    description: `TravelTomo ${parsed.data.tier} promotion (${parsed.data.months} mo)`,
    payerEmail: user.email,
    metadata: { merchant_id: user.id, tier: parsed.data.tier },
  });

  // In mock mode we treat the invoice as already paid so local/CI flows
  // can exercise recommendation logic. In live mode we'd insert the row
  // with status 'pending' and wait for the Xendit webhook.
  const subscriptionStatus: "active" | "pending" = isMockMode()
    ? "active"
    : "pending";

  const { data, error } = await supabase
    .from("merchant_subscriptions")
    .insert({
      merchant_id: user.id,
      tier: parsed.data.tier,
      status: subscriptionStatus,
      starts_at: new Date().toISOString(),
      ends_at: endsAt.toISOString(),
      amount_cents: amountCents,
      currency: "PHP",
      payment_provider: "xendit",
      external_ref: invoice.id,
    })
    .select("id")
    .single();

  if (error) return { error: { _form: [error.message] } };
  revalidatePath("/admin/promote");
  return {
    success: true,
    id: data.id,
    invoice: {
      id: invoice.id,
      url: invoice.invoice_url,
      status: invoice.status,
      mock: isMockMode(),
    },
  };
}

export async function cancelSubscription(subscriptionId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("merchant_subscriptions")
    .update({ status: "cancelled" })
    .eq("id", subscriptionId)
    .eq("merchant_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/promote");
  return { success: true };
}
