import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Gift, CheckCircle, Users } from "lucide-react";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [challengeRes, completionRes, redemptionRes] = await Promise.all([
    supabase
      .from("challenges")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", user.id),
    supabase
      .from("challenge_completions")
      .select("id", { count: "exact", head: true })
      .in(
        "challenge_id",
        (
          await supabase
            .from("challenges")
            .select("id")
            .eq("merchant_id", user.id)
        ).data?.map((c: Record<string, unknown>) => c.id as string) ?? []
      ),
    supabase
      .from("reward_redemptions")
      .select("id", { count: "exact", head: true })
      .in(
        "reward_id",
        (
          await supabase
            .from("rewards")
            .select("id")
            .eq("merchant_id", user.id)
        ).data?.map((r: Record<string, unknown>) => r.id as string) ?? []
      ),
  ]);

  const challengeCount = challengeRes.count ?? 0;
  const completionCount = completionRes.count ?? 0;
  const redemptionCount = redemptionRes.count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-zinc-400 mt-1">
          Track how your challenges are performing.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Challenges"
          value={challengeCount}
          icon={<Trophy className="h-4 w-4 text-zinc-500" />}
        />
        <StatCard
          title="Completions"
          value={completionCount}
          icon={<CheckCircle className="h-4 w-4 text-green-500" />}
          color="text-green-400"
        />
        <StatCard
          title="Redemptions"
          value={redemptionCount}
          icon={<Gift className="h-4 w-4 text-yellow-500" />}
          color="text-yellow-400"
        />
        <StatCard
          title="Conversion"
          value={
            completionCount > 0
              ? `${Math.round((redemptionCount / completionCount) * 100)}%`
              : "0%"
          }
          icon={<Users className="h-4 w-4 text-blue-500" />}
          color="text-blue-400"
        />
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Activity Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
            <p className="text-sm">Activity feed coming soon.</p>
            <p className="text-xs text-zinc-600 mt-1">
              Recent completions and redemptions will appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color = "text-white",
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-zinc-400">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
