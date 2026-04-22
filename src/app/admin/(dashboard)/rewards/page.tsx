import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gift } from "lucide-react";

export default async function RewardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: rewards } = await supabase
    .from("rewards")
    .select("*, challenges(title, status)")
    .eq("merchant_id", user.id)
    .order("created_at", { ascending: false });

  const rewardsList = (rewards ?? []) as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Rewards</h1>
        <p className="text-zinc-400 mt-1">
          View rewards linked to your challenges.
        </p>
      </div>

      {rewardsList.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Gift className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white">No rewards yet</h3>
            <p className="text-zinc-400 mt-1 text-center">
              Rewards are created when you add a challenge.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rewardsList.map((rw) => {
            const challenge = rw.challenges as Record<string, unknown> | null;

            return (
              <Card
                key={rw.id as string}
                className="bg-zinc-900 border-zinc-800"
              >
                <CardHeader className="flex flex-row items-start justify-between">
                  <div className="space-y-1 min-w-0 flex-1">
                    <CardTitle className="text-white truncate">
                      {rw.title as string}
                    </CardTitle>
                    {challenge && (
                      <p className="text-xs text-zinc-500">
                        {challenge.title as string}
                      </p>
                    )}
                  </div>
                  <Badge className="bg-zinc-700 text-zinc-200">
                    {rw.discount_type as string}
                  </Badge>
                </CardHeader>
                <CardContent>
                  {(rw.description as string | null) && (
                    <p className="text-sm text-zinc-400 mb-3">
                      {rw.description as string}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    {rw.discount_value != null && (
                      <span>
                        {(rw.discount_type as string) === "percentage"
                          ? `${rw.discount_value}% off`
                          : (rw.discount_type as string) === "fixed"
                            ? `$${rw.discount_value} off`
                            : "Freebie"}
                      </span>
                    )}
                    <span>
                      {(rw.current_redemptions as number) ?? 0}
                      {rw.max_redemptions != null
                        ? ` / ${rw.max_redemptions as number}`
                        : ""}{" "}
                      redeemed
                    </span>
                    {challenge && (
                      <Badge
                        className={
                          (challenge.status as string) === "live"
                            ? "bg-green-600/20 text-green-400"
                            : "bg-zinc-700 text-zinc-300"
                        }
                      >
                        {(challenge.status as string).replace("_", " ")}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
