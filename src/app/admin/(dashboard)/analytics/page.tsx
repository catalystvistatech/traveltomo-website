import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Gift, CheckCircle, Users, Zap } from "lucide-react";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Get merchant's challenge IDs first
  const { data: challenges } = await supabase
    .from("challenges")
    .select("id, title")
    .eq("merchant_id", user.id);
  const challengeIds = (challenges ?? []).map((c) => c.id as string);
  const challengeMap = Object.fromEntries(
    (challenges ?? []).map((c) => [c.id as string, c.title as string])
  );

  // Get reward IDs
  const { data: rewards } = await supabase
    .from("rewards")
    .select("id, title")
    .eq("merchant_id", user.id);
  const rewardIds = (rewards ?? []).map((r) => r.id as string);
  const rewardMap = Object.fromEntries(
    (rewards ?? []).map((r) => [r.id as string, r.title as string])
  );

  const [completionCountRes, redemptionCountRes, recentCompletions, recentRedemptions] =
    await Promise.all([
      supabase
        .from("challenge_completions")
        .select("id", { count: "exact", head: true })
        .in("challenge_id", challengeIds.length ? challengeIds : [""]),
      supabase
        .from("reward_redemptions")
        .select("id", { count: "exact", head: true })
        .in("reward_id", rewardIds.length ? rewardIds : [""]),
      challengeIds.length
        ? supabase
            .from("challenge_completions")
            .select("id, challenge_id, xp_earned, completed_at, profiles!challenge_completions_user_id_fkey(display_name)")
            .in("challenge_id", challengeIds)
            .order("completed_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
      rewardIds.length
        ? supabase
            .from("reward_redemptions")
            .select("id, reward_id, redeemed_at, profiles!reward_redemptions_user_id_fkey(display_name)")
            .in("reward_id", rewardIds)
            .order("redeemed_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ]);

  const challengeCount = challengeIds.length;
  const completionCount = completionCountRes.count ?? 0;
  const redemptionCount = redemptionCountRes.count ?? 0;
  const conversionRate =
    completionCount > 0
      ? `${Math.round((redemptionCount / completionCount) * 100)}%`
      : "0%";

  // Merge and sort activity feed
  type FeedItem = {
    id: string;
    kind: "completion" | "redemption";
    label: string;
    user: string;
    xp?: number;
    timestamp: string;
  };

  const completionItems: FeedItem[] = ((recentCompletions.data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: c.id as string,
    kind: "completion",
    label: challengeMap[c.challenge_id as string] ?? "Challenge",
    user: (c.profiles as { display_name: string | null } | null)?.display_name ?? "Traveler",
    xp: (c.xp_earned as number) ?? 0,
    timestamp: c.completed_at as string,
  }));

  const redemptionItems: FeedItem[] = ((recentRedemptions.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    kind: "redemption",
    label: rewardMap[r.reward_id as string] ?? "Reward",
    user: (r.profiles as { display_name: string | null } | null)?.display_name ?? "Traveler",
    timestamp: r.redeemed_at as string,
  }));

  const feedItems = [...completionItems, ...redemptionItems]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 25);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-zinc-400 mt-1">
          Track how your challenges are performing.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Challenges" value={challengeCount} icon={<Trophy className="h-4 w-4 text-zinc-500" />} />
        <StatCard title="Completions" value={completionCount} icon={<CheckCircle className="h-4 w-4 text-green-500" />} color="text-green-400" />
        <StatCard title="Redemptions" value={redemptionCount} icon={<Gift className="h-4 w-4 text-yellow-500" />} color="text-yellow-400" />
        <StatCard title="Conversion" value={conversionRate} icon={<Users className="h-4 w-4 text-blue-500" />} color="text-blue-400" />
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            Activity Feed
          </CardTitle>
        </CardHeader>
        <CardContent>
          {feedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
              <p className="text-sm">No activity yet.</p>
              <p className="text-xs text-zinc-600 mt-1">
                Completions and redemptions will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {feedItems.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="flex items-center justify-between py-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      item.kind === "completion"
                        ? "bg-green-600/15 text-green-400"
                        : "bg-yellow-600/15 text-yellow-400"
                    }`}>
                      {item.kind === "completion"
                        ? <CheckCircle className="h-4 w-4" />
                        : <Gift className="h-4 w-4" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">
                        <span className="font-medium">{item.user}</span>
                        {" "}
                        {item.kind === "completion" ? "completed" : "redeemed"}
                        {" "}
                        <span className="text-zinc-300">{item.label}</span>
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(item.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.kind === "completion" && item.xp != null && item.xp > 0 && (
                      <Badge className="bg-green-600/20 text-green-400 text-xs">+{item.xp} XP</Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={item.kind === "completion"
                        ? "border-green-800 text-green-500 text-[10px]"
                        : "border-yellow-800 text-yellow-500 text-[10px]"
                      }
                    >
                      {item.kind}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
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
        <p className="text-sm font-medium text-zinc-400">{title}</p>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
