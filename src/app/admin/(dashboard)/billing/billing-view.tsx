"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, CreditCard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, PLAN_ORDER, type PlanCode } from "@/lib/plans";
import { startPlanCheckout, manageBilling } from "@/lib/actions/billing";

export function BillingView({
  currentPlan,
  used,
  businessLimit,
  stripeConfigured,
  status,
}: {
  currentPlan: PlanCode;
  used: number;
  businessLimit: number | null;
  stripeConfigured: boolean;
  status?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function upgrade(plan: PlanCode) {
    setBusy(plan);
    try {
      const res = await startPlanCheckout(plan);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("url" in res && res.url) {
        window.location.href = res.url;
        return; // keep the spinner while the browser navigates to Stripe
      }
      toast.error("Couldn't start checkout. Please try again.");
    } catch {
      toast.error("Couldn't start checkout. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function manage() {
    setBusy("manage");
    try {
      const res = await manageBilling();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("url" in res && res.url) {
        window.location.href = res.url;
        return;
      }
      toast.error("Couldn't open billing. Please try again.");
    } catch {
      toast.error("Couldn't open billing. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const limitLabel = businessLimit === null ? "Unlimited" : `${used} / ${businessLimit}`;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Billing &amp; Plan</h1>
        <p className="text-zinc-400 mt-1">
          Your plan controls how many businesses you can run. Upgrade anytime.
        </p>
      </div>

      {status === "success" && (
        <div className="rounded-lg border border-green-900/60 bg-green-900/10 px-4 py-3 text-sm text-green-300">
          Payment received - your plan will update within a few seconds.
        </div>
      )}
      {status === "cancelled" && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-400">
          Checkout cancelled - no changes were made.
        </div>
      )}
      {!stripeConfigured && (
        <div className="rounded-lg border border-yellow-900/60 bg-yellow-900/10 px-4 py-3 text-sm text-yellow-300">
          Billing isn&apos;t fully configured yet. You can review plans below;
          upgrades will be enabled once payment keys are set.
        </div>
      )}

      {/* Current usage */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800">
          <CreditCard className="h-5 w-5 text-zinc-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-400">Current plan</p>
          <p className="font-semibold text-white capitalize">{PLANS[currentPlan].label}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-zinc-400">Businesses used</p>
          <p className="font-semibold text-white">{limitLabel}</p>
        </div>
        {currentPlan !== "free" && (
          <Button
            variant="outline"
            className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            disabled={!stripeConfigured || busy !== null}
            onClick={manage}
          >
            {busy === "manage" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Manage billing"
            )}
          </Button>
        )}
      </div>

      {/* Plan cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((code) => {
          const plan = PLANS[code];
          const isCurrent = code === currentPlan;
          const isPaid = code !== "free";
          const highlight = code === "growth";
          return (
            <div
              key={code}
              className={`relative flex flex-col rounded-xl border p-5 ${
                isCurrent
                  ? "border-red-600/60 bg-red-600/5"
                  : highlight
                    ? "border-zinc-700 bg-zinc-900/80"
                    : "border-zinc-800 bg-zinc-900/40"
              }`}
            >
              {highlight && !isCurrent && (
                <div className="absolute -top-2.5 left-5">
                  <Badge className="bg-red-600 text-white">
                    <Sparkles className="mr-1 h-3 w-3" />
                    Popular
                  </Badge>
                </div>
              )}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{plan.label}</h3>
                {isCurrent && (
                  <Badge className="bg-zinc-700 text-zinc-200">Current</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-zinc-400">{plan.blurb}</p>
              <div className="mt-4">
                <span className="text-2xl font-bold text-white">
                  {plan.pricePhpMonthly === 0
                    ? "Free"
                    : `\u20B1${plan.pricePhpMonthly.toLocaleString()}`}
                </span>
                {plan.pricePhpMonthly > 0 && (
                  <span className="text-sm text-zinc-500"> / month</span>
                )}
              </div>

              <ul className="mt-4 space-y-2 text-sm text-zinc-300">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-400" />
                  {plan.businessLimit === null
                    ? "Unlimited businesses"
                    : `${plan.businessLimit} business${plan.businessLimit === 1 ? "" : "es"}`}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-400" />
                  Unlimited quests &amp; rewards
                </li>
              </ul>

              <div className="mt-auto pt-5">
                {isCurrent ? (
                  <Button disabled className="w-full bg-zinc-800 text-zinc-400">
                    Your plan
                  </Button>
                ) : isPaid ? (
                  <Button
                    className="w-full bg-red-600 text-white hover:bg-red-700"
                    disabled={!stripeConfigured || busy !== null}
                    onClick={() => upgrade(code)}
                  >
                    {busy === code ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      `Choose ${plan.label}`
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    disabled={!stripeConfigured || busy !== null}
                    onClick={manage}
                  >
                    Downgrade
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
