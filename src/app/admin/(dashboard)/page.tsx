import Link from "next/link";
import { getCurrentUser, requestMerchantAccess } from "@/lib/actions/auth";
import {
  getRecommendationStatus,
  getAdminOverview,
  getTravelChallengeSummary,
} from "@/lib/actions/status";
import { countVisitsToApprove } from "@/lib/actions/redeemCode";
import { RedeemCodeBox } from "@/components/dashboard/redeem-code-box";
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
  Megaphone,
  AlertTriangle,
  Users,
  Sparkles,
} from "lucide-react";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Plain travelers (role "user") shouldn't see the merchant dashboard. Show
  // them a clear "this is for merchants" notice with a path to either the app
  // or requesting merchant access.
  if (user.role === "user") {
    return (
      <TravelerNotice
        pending={user.merchant_request_status === "pending"}
        name={user.display_name}
      />
    );
  }

  const isAdmin = user.role === "admin" || user.role === "superadmin";

  // Each action is resilient on its own (returns a default on failure)
  // but we also defensively wrap them so a single regression can never
  // crash the dashboard home with a generic "Server Components render"
  // error.
  const [status, summary, visitsToApprove, adminOverview] = await Promise.all([
    getRecommendationStatus().catch(() => ({
      isMerchant: false,
      businessVerified: false,
      businessVerificationStatus: null,
      hasLocation: false,
      hasHours: false,
      isOpenNow: false,
      hasActivePromotion: false,
      liveTravelChallenges: 0,
      isRecommendable: false,
      blockers: [] as string[],
    })),
    getTravelChallengeSummary().catch(() => ({
      draft: 0,
      pending: 0,
      live: 0,
      rejected: 0,
    })),
    countVisitsToApprove().catch(() => 0),
    isAdmin ? getAdminOverview().catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="inline-block border-b-2 border-red-500 pb-1 text-3xl font-bold text-white">
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
            Your merchant account is <b>pending admin verification</b>.
            Business profile creation, challenge creation, and promotions all
            unlock once an admin approves your application. We&rsquo;ll let
            you know via email and an in-app notification.
          </CardContent>
        </Card>
      )}

      {/* The thing staff do most: hand over a reward to someone at the counter. */}
      {(status.isMerchant || isAdmin) && <RedeemCodeBox />}

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
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Visits to approve"
            value={visitsToApprove}
            icon={<Clock className="h-4 w-4 text-yellow-400" />}
            href="/admin/completions"
            accent={visitsToApprove > 0 ? "text-yellow-300" : undefined}
          />
          <StatCard
            title="Live quests"
            value={status.isMerchant ? status.liveTravelChallenges : summary.live}
            icon={<Eye className="h-4 w-4 text-green-400" />}
            href="/admin/travel-challenges"
            accent="text-green-400"
          />
          <StatCard
            title="Drafts to finish"
            value={summary.draft}
            icon={<Trophy className="h-4 w-4 text-zinc-400" />}
            href="/admin/travel-challenges"
          />
        </div>
      )}

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/admin/travel-challenges/new">
            <Button className="bg-red-600 hover:bg-red-700">Make a quest</Button>
          </Link>
          <Link href="/admin/stamp-cards">
            <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              Stamp cards
            </Button>
          </Link>
          <Link href="/admin/completions">
            <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              Approve visits{visitsToApprove > 0 ? ` (${visitsToApprove})` : ""}
            </Button>
          </Link>
          <Link href="/admin/business">
            <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              Business profile
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function TravelerNotice({
  pending,
  name,
}: {
  pending: boolean;
  name: string | null;
}) {
  return (
    <div className="mx-auto mt-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">
          Welcome, {name ?? "traveler"}
        </h1>
        <p className="mt-1 text-zinc-400">This dashboard is for merchants.</p>
      </div>

      {pending ? (
        <Card className="bg-yellow-600/10 border-yellow-600/40">
          <CardContent className="py-5 text-sm text-yellow-200">
            Your request to become a merchant is{" "}
            <b>pending admin verification</b>. We&rsquo;ll email you and send an
            in-app notification once it&rsquo;s approved.
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="space-y-4 py-6">
            <p className="text-zinc-200">
              You&rsquo;re signed in as a <b>traveler</b>. The TravelTomo app is
              where you roll the dice, complete challenges, and earn rewards
              &mdash; this dashboard is for businesses (merchants).
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="https://www.traveltomo.app" target="_blank" rel="noreferrer">
                <Button className="bg-red-600 hover:bg-red-700">Get the app</Button>
              </a>
              <form
                action={async () => {
                  "use server";
                  await requestMerchantAccess();
                }}
              >
                <Button
                  type="submit"
                  variant="outline"
                  className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                >
                  I want to become a merchant
                </Button>
              </form>
            </div>
            <p className="text-xs text-zinc-500">
              Becoming a merchant lets you create challenges and rewards for
              travelers. An admin reviews each request.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  href,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  href?: string;
  accent?: string;
}) {
  const content = (
    <div className="rounded-2xl bg-gradient-to-br from-red-600 to-red-800 p-5 shadow-lg shadow-red-950/40 ring-1 ring-red-500/30 transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white/80">{title}</p>
        <span className="text-white/70">{icon}</span>
      </div>
      <div className="mt-4 text-3xl font-bold text-white">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function RecommendationStatusCard({
  status,
}: {
  status: Awaited<ReturnType<typeof getRecommendationStatus>>;
}) {
  // Only what actually decides visibility (see getRecommendationStatus).
  const items = [
    {
      ok: status.businessVerified,
      label: status.businessVerified ? "Business verified" : "Waiting for business verification",
      href: "/admin/business",
    },
    { ok: status.hasLocation, label: "Location set on map", href: "/admin/business" },
    {
      ok: status.liveTravelChallenges > 0,
      label:
        status.liveTravelChallenges > 0
          ? `${status.liveTravelChallenges} live quest${status.liveTravelChallenges === 1 ? "" : "s"}`
          : status.blockers.find((b) => b.startsWith("Your quest")) ?? "Make your first quest",
      href: status.liveTravelChallenges > 0 ? "/admin/travel-challenges" : "/admin/travel-challenges/new",
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
            Can travelers find you?
          </CardTitle>
          <p className="text-xs text-zinc-400 mt-1">
            All three must be green for your quests to show in the app.
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
        <div className="grid gap-2 md:grid-cols-3">
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
