import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Gift, Users, TrendingUp } from "lucide-react";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { count: completionCount } = await supabase
    .from("challenge_completions")
    .select("*", { count: "exact", head: true })
    .in(
      "challenge_id",
      (
        await supabase
          .from("challenges")
          .select("id")
          .eq("merchant_id", user.id)
      ).data?.map((c: { id: string }) => c.id) ?? []
    );

  const { count: redemptionCount } = await supabase
    .from("reward_redemptions")
    .select("*", { count: "exact", head: true })
    .in(
      "reward_id",
      (
        await supabase
          .from("rewards")
          .select("id")
          .eq("merchant_id", user.id)
      ).data?.map((r: { id: string }) => r.id) ?? []
    );

  const { count: challengeCount } = await supabase
    .from("challenges")
    .select("*", { count: "exact", head: true })
    .eq("merchant_id", user.id)
    .eq("status", "live");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-zinc-400 mt-1">
          Track how travelers engage with your challenges.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Live Challenges
            </CardTitle>
            <Trophy className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {challengeCount ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Total Completions
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {completionCount ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Reward Redemptions
            </CardTitle>
            <Gift className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {redemptionCount ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Conversion Rate
            </CardTitle>
            <Users className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {completionCount && redemptionCount
                ? `${Math.round((redemptionCount / completionCount) * 100)}%`
                : ""}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Activity Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-zinc-400 text-sm">
            Detailed activity charts will appear here once challenges are live
            and travelers start completing them.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
