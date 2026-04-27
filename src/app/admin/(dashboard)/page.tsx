import Link from "next/link";
import { getCurrentUser } from "@/lib/actions/auth";
import {
  getRecommendationStatus,
  getAdminOverview,
  getTravelChallengeSummary,
} from "@/lib/actions/status";
import { getActiveSubscription } from "@/lib/actions/subscriptions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  Eye,
  CheckCircle2,
  Clock,
  Store,
  ShieldCheck,
  Megaphone,
  AlertTriangle,
  Users,
  Sparkles,
} from "lucide-react";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const isAdmin = user.role === "admin" || user.role === "superadmin";
  const [status, summary, subscription, adminOverview] = await Promise.all([
    getRecommendationStatus(),
    getTravelChallengeSummary(),
    getActiveSubscription(),
    isAdmin ? getAdminOverview() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">
          Welcome back, {user.display_name ?? "there"}
        </h1>
        <p className="text-zinc-400 mt-1">
          {isAdmin
            ? "Operations overview across the marketplace."
            : "Everything you need to keep your business visible to travelers."}
        </p>
      </div>

      {user.role === "merchant" && user.merchant_request_status !== "approved" && (
        <Card className="bg-yellow-600/10 border-yellow-600/40">
          <CardContent className="py-4 text-sm text-yellow-200">
            Your merchant account is <b>pending admin verification</b>. Finish
            your business profile and submit it &mdash; challenges can&rsquo;t go
            live until an admin approves you.
          </CardContent>
        </Card>
      )}

      {status.isMerchant && <RecommendationStatusCard status={status} />}

      {isAdmin && adminOverview && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Pending Businesses"
            value={adminOverview.businessesPending}
            icon={<Store className="h-4 w-4 text-yellow-400" />}
            href="/admin/manage/businesses"
            accent={adminOverview.businessesPending > 0 ? "text-yellow-300" : undefined}
          />
          <StatCard
            title="Pending Travel Challenges"
            value={adminOverview.travelChallengesPending}
            icon={<ShieldCheck className="h-4 w-4 text-yellow-400" />}
            href="/admin/manage/travel-challenges"
            accent={adminOverview.travelChallengesPending > 0 ? "text-yellow-300" : undefined}
          />
          <StatCard
            title="Merchants"
            value={adminOverview.merchantsTotal}
            icon={<Users className="h-4 w-4 text-zinc-400" />}
            href="/admin/manage/merchants"
          />
          <StatCard
            title="Active Promotions"
            value={adminOverview.subscriptionsActive}
            icon={<Megaphone className="h-4 w-4 text-red-400" />}
          />
        </div>
      )}

      {summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Live Travel Challenges"
            value={summary.live}
            icon={<Eye className="h-4 w-4 text-green-400" />}
            accent="text-green-400"
          />
          <StatCard
            title="Pending Review"
            value={summary.pending}
            icon={<Clock className="h-4 w-4 text-yellow-400" />}
            accent="text-yellow-300"
          />
          <StatCard
            title="Drafts"
            value={summary.draft}
            icon={<Trophy className="h-4 w-4 text-zinc-400" />}
          />
          <StatCard
            title="Rejected"
            value={summary.rejected}
            icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
            accent={summary.rejected > 0 ? "text-red-400" : undefined}
          />
        </div>
      )}

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/admin/travel-challenges">
            <Button className="bg-red-600 hover:bg-red-700">
              Manage Travel Challenges
            </Button>
          </Link>
          <Link href="/admin/business">
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Business Profile
            </Button>
          </Link>
          <Link href="/admin/completions">
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Verify Completions
            </Button>
          </Link>
          <Link href="/admin/promote">
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              {subscription ? "Manage Promotion" : "Start Promotion"}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  href,
  accent = "text-white",
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  href?: string;
  accent?: string;
}) {
  const content = (
    <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-zinc-400">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function RecommendationStatusCard({
  status,
}: {
  status: Awaited<ReturnType<typeof getRecommendationStatus>>;
}) {
  const items = [
    {
      ok: status.businessVerified,
      label: `Business verified (${status.businessVerificationStatus ?? "none"})`,
      href: "/admin/business",
    },
    { ok: status.hasLocation, label: "Location set on map", href: "/admin/business" },
    { ok: status.hasHours, label: "Operating hours configured", href: "/admin/business" },
    {
      ok: status.isOpenNow,
      label: "Currently within operating hours",
      href: "/admin/business",
    },
    {
      ok: status.hasActivePromotion,
      label: "Active promotion subscription",
      href: "/admin/promote",
    },
    {
      ok: status.liveTravelChallenges > 0,
      label: `${status.liveTravelChallenges} live travel challenge(s)`,
      href: "/admin/travel-challenges",
    },
  ];

  return (
    <Card
      className={
        status.isRecommendable
          ? "bg-green-900/15 border-green-900/60"
          : "bg-zinc-900 border-zinc-800"
      }
    >
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-white flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-red-400" />
            Recommendation Status
          </CardTitle>
          <p className="text-xs text-zinc-400 mt-1">
            Everything that must be true for your challenges to appear in the
            traveler app.
          </p>
        </div>
        <Badge
          className={
            status.isRecommendable
              ? "bg-green-600 text-white"
              : "bg-zinc-700 text-zinc-200"
          }
        >
          {status.isRecommendable ? "Appearing to travelers" : "Not appearing"}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((it) => (
            <Link
              key={it.label}
              href={it.href}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                it.ok
                  ? "border-green-900/60 bg-green-900/10 text-green-300"
                  : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700"
              }`}
            >
              {it.ok ? (
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
              )}
              <span>{it.label}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
