"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getActiveSubscription,
  listSubscriptionHistory,
  startSubscription,
  cancelSubscription,
} from "@/lib/actions/subscriptions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Crown, Star } from "lucide-react";
import { toast } from "sonner";

type Sub = Awaited<ReturnType<typeof getActiveSubscription>>;
type Row = Awaited<ReturnType<typeof listSubscriptionHistory>>[number];

const TIERS: {
  key: "basic" | "featured" | "premium";
  title: string;
  price: string;
  perks: string[];
  icon: React.ReactNode;
}[] = [
  {
    key: "basic",
    title: "Basic",
    price: "?99 / mo",
    icon: <Sparkles className="h-5 w-5" />,
    perks: [
      "Stay visible in recommendations",
      "Standard placement within radius",
      "Email support",
    ],
  },
  {
    key: "featured",
    title: "Featured",
    price: "?299 / mo",
    icon: <Star className="h-5 w-5" />,
    perks: [
      "Boosted position in the dice pool",
      "Featured badge on detail screen",
      "Priority support",
    ],
  },
  {
    key: "premium",
    title: "Premium",
    price: "?799 / mo",
    icon: <Crown className="h-5 w-5" />,
    perks: [
      "Top-of-list placement",
      "Appears in city-wide discovery carousel",
      "Dedicated success manager",
    ],
  },
];

export default function PromotePage() {
  const [active, setActive] = useState<Sub | null>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [pending, startTransition] = useTransition();

  async function reload() {
    setActive(await getActiveSubscription());
    setHistory(await listSubscriptionHistory());
  }

  useEffect(() => {
    reload();
  }, []);

  function handleStart(tier: "basic" | "featured" | "premium") {
    startTransition(async () => {
      const r = await startSubscription({ tier, months: 1 });
      if ("error" in r) {
        const err = r.error as Record<string, unknown>;
        toast.error(
          "_form" in err ? (err._form as string[])[0] : "Could not start"
        );
        return;
      }
      toast.success("Promotion started � you'll appear in recommendations.");
      await reload();
    });
  }

  function handleCancel(id: string) {
    if (!confirm("Cancel this subscription?")) return;
    startTransition(async () => {
      const r = await cancelSubscription(id);
      if ("error" in r) toast.error(r.error as string);
      else {
        toast.success("Cancelled");
        await reload();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Promote my Business</h1>
        <p className="text-zinc-400 mt-1">
          Merchants only appear in the traveler app if they&rsquo;re on an
          active promotion tier and currently open.
        </p>
      </div>

      {active && (
        <Card className="bg-green-900/20 border-green-900">
          <CardHeader>
            <CardTitle className="text-white capitalize flex items-center gap-2">
              {(active as Record<string, unknown>).tier as string} plan active
              <Badge className="bg-green-600 text-white">Active</Badge>
            </CardTitle>
            <CardDescription className="text-zinc-300">
              Ends{" "}
              {new Date(
                (active as Record<string, unknown>).ends_at as string
              ).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() =>
                handleCancel((active as Record<string, unknown>).id as string)
              }
              disabled={pending}
              className="border-zinc-700 text-zinc-300"
            >
              Cancel Promotion
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((t) => (
          <Card key={t.key} className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <div className="flex items-center gap-2 text-white">
                {t.icon}
                <CardTitle className="text-white">{t.title}</CardTitle>
              </div>
              <CardDescription className="text-zinc-400">
                {t.price}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="text-sm text-zinc-300 space-y-2 list-disc list-inside">
                {t.perks.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <Button
                onClick={() => handleStart(t.key)}
                disabled={pending}
                className="w-full bg-red-600 hover:bg-red-700 text-white"
              >
                {active ? "Switch to this tier" : "Start Promotion"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {history.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-zinc-800">
              {history.map((h) => {
                const r = h as Record<string, unknown>;
                return (
                  <div
                    key={r.id as string}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <span className="capitalize text-zinc-200">
                      {r.tier as string}
                    </span>
                    <span className="text-zinc-500">
                      {new Date(r.starts_at as string).toLocaleDateString()} ?{" "}
                      {new Date(r.ends_at as string).toLocaleDateString()}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        (r.status as string) === "active"
                          ? "border-green-600 text-green-400"
                          : "border-zinc-700 text-zinc-400"
                      }
                    >
                      {r.status as string}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-zinc-500">
        Note: payments are deferred in this build. Subscriptions are created
        immediately with a dev external reference so you can test the
        recommendation logic end-to-end.
      </p>
    </div>
  );
}
