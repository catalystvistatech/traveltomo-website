import Link from "next/link";
import { getMerchantClaimAnalytics } from "@/lib/actions/claims";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  Gift,
  CheckCircle,
  Users,
  Zap,
  Clock,
  XCircle,
  TrendingUp,
  ListChecks,
} from "lucide-react";

const WINDOW_DAYS = 30;

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const analytics = await getMerchantClaimAnalytics(WINDOW_DAYS);
  const { totals, daily, topChallenges, topCustomers } = analytics;

  // The "Activity Feed" is shared between completions and redemptions so
  // it still has its own dedicated fetch. We deliberately go through the
  // user's RLS client (not service_role) so a misconfigured merchant
  // can't see another merchant's traffic.
  const { data: challenges } = await supabase
    .from("challenges")
    .select("id, title")
    .eq("merchant_id", user.id);
  const challengeIds = (challenges ?? []).map((c) => c.id as string);
  const challengeMap = Object.fromEntries(
    (challenges ?? []).map((c) => [c.id as string, c.title as string])
  );

  const { data: rewards } = await supabase
    .from("rewards")
    .select("id, title")
    .eq("merchant_id", user.id);
  const rewardIds = (rewards ?? []).map((r) => r.id as string);
  const rewardMap = Object.fromEntries(
    (rewards ?? []).map((r) => [r.id as string, r.title as string])
  );

  const [recentCompletionsRes, recentRedemptionsRes] = await Promise.all([
    challengeIds.length
      ? supabase
          .from("challenge_completions")
          .select(
            "id, challenge_id, xp_earned, completed_at, verification_status, profiles!challenge_completions_user_id_fkey(display_name)"
          )
          .in("challenge_id", challengeIds)
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    rewardIds.length
      ? supabase
          .from("reward_redemptions")
          .select(
            "id, reward_id, redeemed_at, profiles!reward_redemptions_user_id_fkey(display_name)"
          )
          .in("reward_id", rewardIds)
          .order("redeemed_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  type FeedItem = {
    id: string;
    kind: "completion" | "redemption";
    label: string;
    user: string;
    status?: string;
    xp?: number;
    timestamp: string;
  };

  const completionItems: FeedItem[] = (
    (recentCompletionsRes.data ?? []) as Record<string, unknown>[]
  ).map((c) => ({
    id: c.id as string,
    kind: "completion" as const,
    label: challengeMap[c.challenge_id as string] ?? "Challenge",
    user:
      (c.profiles as { display_name: string | null } | null)?.display_name ??
      "Traveler",
    xp: (c.xp_earned as number) ?? 0,
    status: c.verification_status as string,
    timestamp: c.completed_at as string,
  }));

  const redemptionItems: FeedItem[] = (
    (recentRedemptionsRes.data ?? []) as Record<string, unknown>[]
  ).map((r) => ({
    id: r.id as string,
    kind: "redemption" as const,
    label: rewardMap[r.reward_id as string] ?? "Reward",
    user:
      (r.profiles as { display_name: string | null } | null)?.display_name ??
      "Traveler",
    timestamp: r.redeemed_at as string,
  }));

  const feedItems: FeedItem[] = [...completionItems, ...redemptionItems]
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, 25);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-zinc-400 mt-1">
            Last {WINDOW_DAYS} days of activity on your travel challenges.
          </p>
        </div>
        <Link href="/admin/claims">
          <Button variant="outline" className="border-zinc-700 text-zinc-200 hover:bg-zinc-800">
            <ListChecks className="mr-2 h-4 w-4" />
            Full Claim History
          </Button>
        </Link>
      </div>

      {/* Headline stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Completions"
          value={totals.completions}
          icon={<CheckCircle className="h-4 w-4 text-green-400" />}
          accent="text-green-300"
          href="/admin/claims"
          subtitle={`${WINDOW_DAYS}-day window`}
        />
        <StatCard
          title="Pending Verification"
          value={totals.pending}
          icon={<Clock className="h-4 w-4 text-yellow-400" />}
          accent={totals.pending > 0 ? "text-yellow-300" : undefined}
          href="/admin/completions"
          subtitle="Waiting for you"
        />
        <StatCard
          title="Claimed by Travelers"
          value={totals.verified}
          icon={<Gift className="h-4 w-4 text-red-400" />}
          accent="text-red-300"
          subtitle={`${totals.conversionRate} verified`}
        />
        <StatCard
          title="Rejected"
          value={totals.rejected}
          icon={<XCircle className="h-4 w-4 text-zinc-400" />}
          accent={totals.rejected > 0 ? "text-zinc-200" : undefined}
        />
      </div>

      {/* Daily chart */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-red-400" />
            Daily Completions
          </CardTitle>
          <p className="text-xs text-zinc-500 mt-1">
            Pending, claimed, and rejected stacked per day.
          </p>
        </CardHeader>
        <CardContent>
          <DailyChart data={daily} />
          <ChartLegend />
        </CardContent>
      </Card>

      {/* Top challenges + top customers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-yellow-400" />
              Top Challenges
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topChallenges.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No completions yet. Once travelers finish your challenges
                they&apos;ll be ranked here.
              </p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {topChallenges.map((c, i) => (
                  <div
                    key={c.challengeId}
                    className="flex items-center justify-between py-3 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
                        {i + 1}
                      </span>
                      <Link
                        href={`/admin/claims?challenge=${c.challengeId}`}
                        className="text-sm text-white truncate hover:underline"
                      >
                        {c.title}
                      </Link>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className="bg-zinc-800 text-zinc-200 text-[10px]">
                        {c.completions} total
                      </Badge>
                      {c.verified > 0 && (
                        <Badge className="bg-green-600/20 text-green-300 text-[10px]">
                          {c.verified} claimed
                        </Badge>
                      )}
                      {c.pending > 0 && (
                        <Badge className="bg-yellow-600/20 text-yellow-300 text-[10px]">
                          {c.pending} pending
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-blue-400" />
              Top Travelers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Your power users will show up here once a few travelers have
                completed multiple challenges.
              </p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {topCustomers.map((c, i) => (
                  <div
                    key={c.userId}
                    className="flex items-center justify-between py-3 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-white">
                        {(c.displayName?.[0] ?? "T").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">
                          {c.displayName}
                        </p>
                        <p className="text-xs text-zinc-500">
                          rank #{i + 1}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className="bg-zinc-800 text-zinc-200 text-[10px]">
                        {c.completions} done
                      </Badge>
                      {c.verified > 0 && (
                        <Badge className="bg-green-600/20 text-green-300 text-[10px]">
                          {c.verified} claimed
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity feed (recent completions + redemptions, mixed) */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            Recent Activity
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
                <div
                  key={`${item.kind}-${item.id}`}
                  className="flex items-center justify-between py-3 gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        item.kind === "completion"
                          ? "bg-green-600/15 text-green-400"
                          : "bg-yellow-600/15 text-yellow-400"
                      }`}
                    >
                      {item.kind === "completion" ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Gift className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">
                        <span className="font-medium">{item.user}</span>{" "}
                        {item.kind === "completion"
                          ? "completed"
                          : "redeemed"}{" "}
                        <span className="text-zinc-300">{item.label}</span>
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(item.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.kind === "completion" &&
                      item.status &&
                      item.status !== "pending" && (
                        <Badge
                          variant="outline"
                          className={
                            item.status === "verified"
                              ? "border-green-700 text-green-300 text-[10px]"
                              : "border-red-700 text-red-300 text-[10px]"
                          }
                        >
                          {item.status === "verified" ? "claimed" : "rejected"}
                        </Badge>
                      )}
                    {item.kind === "completion" &&
                      item.xp != null &&
                      item.xp > 0 && (
                        <Badge className="bg-green-600/20 text-green-400 text-xs">
                          +{item.xp} XP
                        </Badge>
                      )}
                    <Badge
                      variant="outline"
                      className={
                        item.kind === "completion"
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

// -------- inline bar chart --------

/**
 * Simple SVG-free stacked-bar chart. We keep this dependency-free so the
 * dashboard bundle stays light; this rolls up the same shape as the
 * `daily` analytics field. Each day is a vertical column with three
 * stacked segments (pending / verified / rejected).
 */
function DailyChart({
  data,
}: {
  data: {
    date: string;
    pending: number;
    verified: number;
    rejected: number;
  }[];
}) {
  const max = Math.max(
    1,
    ...data.map((d) => d.pending + d.verified + d.rejected)
  );
  return (
    <div className="flex items-end gap-1 h-40 w-full">
      {data.map((d) => {
        const total = d.pending + d.verified + d.rejected;
        const pct = (n: number) => (total === 0 ? 0 : (n / max) * 100);
        return (
          <div
            key={d.date}
            className="group relative flex-1 flex flex-col-reverse rounded-sm overflow-hidden bg-zinc-800/40 min-h-[4px]"
            title={`${d.date} - ${total} total (${d.pending} pending, ${d.verified} claimed, ${d.rejected} rejected)`}
          >
            <div
              className="bg-green-500/80"
              style={{ height: `${pct(d.verified)}%` }}
            />
            <div
              className="bg-yellow-500/80"
              style={{ height: `${pct(d.pending)}%` }}
            />
            <div
              className="bg-red-500/70"
              style={{ height: `${pct(d.rejected)}%` }}
            />
            {/* Hover label */}
            <div className="pointer-events-none absolute inset-x-0 bottom-full mb-1 hidden text-center text-[10px] text-zinc-300 group-hover:block">
              {total}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChartLegend() {
  const items = [
    { label: "Claimed", className: "bg-green-500/80" },
    { label: "Pending", className: "bg-yellow-500/80" },
    { label: "Rejected", className: "bg-red-500/70" },
  ];
  return (
    <div className="mt-3 flex items-center gap-4 text-xs text-zinc-400">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-2 w-3 rounded-sm ${it.className}`} />
          {it.label}
        </span>
      ))}
      <span className="ml-auto text-[10px] text-zinc-600">
        Hover a column for the day total.
      </span>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  accent = "text-white",
  href,
  subtitle,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  accent?: string;
  href?: string;
  subtitle?: string;
}) {
  const content = (
    <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <p className="text-sm font-medium text-zinc-400">{title}</p>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${accent}`}>{value}</div>
        {subtitle && (
          <p className="text-[10px] text-zinc-500 mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
