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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Rewards</h1>
        <p className="text-zinc-400 mt-1">Manage rewards attached to your challenges.</p>
      </div>

      {!rewards || rewards.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <Gift className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">
              Rewards are created as part of the challenge wizard.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rewards.map((r: Record<string, unknown>) => {
            const challenge = r.challenges as { title: string; status: string } | null;
            return (
              <Card key={r.id as string} className="bg-zinc-900 border-zinc-800">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-white text-lg">
                      {r.title as string}
                    </CardTitle>
                    <p className="text-sm text-zinc-400">
                      {r.discount_type === "freebie"
                        ? "Freebie"
                        : `${r.discount_value}${(r.discount_type as string) === "percentage" ? "%" : " PHP"} off`}
                      {challenge && ` - ${challenge.title}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-medium">
                      {r.current_redemptions as number}/{r.max_redemptions as number}
                    </p>
                    <p className="text-xs text-zinc-500">redeemed</p>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
