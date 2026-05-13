"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  listMerchantClaims,
  type ClaimListFilters,
  type ClaimListResult,
  type ClaimRow,
  type ClaimStatus,
} from "@/lib/actions/claims";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Download,
  BarChart3,
  Gift,
  Sparkles,
} from "lucide-react";

const PAGE_SIZE = 25;

const STATUS_OPTIONS: { value: ClaimStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Claimed" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_CLASS: Record<ClaimStatus, string> = {
  pending: "border-yellow-700 bg-yellow-900/20 text-yellow-300",
  verified: "border-green-700 bg-green-900/20 text-green-300",
  rejected: "border-red-700 bg-red-900/20 text-red-300",
};

const STATUS_LABEL: Record<ClaimStatus, string> = {
  pending: "Pending",
  verified: "Claimed",
  rejected: "Rejected",
};

const STATUS_ICON: Record<ClaimStatus, React.ReactNode> = {
  pending: <Clock className="h-3 w-3" />,
  verified: <CheckCircle2 className="h-3 w-3" />,
  rejected: <XCircle className="h-3 w-3" />,
};

export default function ClaimsPage() {
  const [data, setData] = useState<ClaimListResult>({
    rows: [],
    total: 0,
    challenges: [],
  });
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [pending, startTransition] = useTransition();

  // --- Filters
  const [status, setStatus] = useState<ClaimStatus | "all">("all");
  const [challengeId, setChallengeId] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState<number>(0);
  // Client-side fuzzy match that runs against the current page result.
  // Server-side search doesn't reach the embedded traveler relation, so
  // we materialise the page first and let the merchant filter locally.
  const [query, setQuery] = useState<string>("");

  // Server-side filters drive the fetch. We deliberately rebuild the
  // filter object in `useEffect` from primitives so we don't need to
  // memoise a parent object - just the four primitive deps + page.
  useEffect(() => {
    const filters: ClaimListFilters = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
    if (status !== "all") filters.status = status;
    if (challengeId !== "all") filters.challengeId = challengeId;
    if (from) filters.from = from;
    if (to) filters.to = to;

    let cancelled = false;
    startTransition(async () => {
      const result = await listMerchantClaims(filters);
      if (cancelled) return;
      setData(result);
      setHasLoadedOnce(true);
    });
    return () => {
      cancelled = true;
    };
  }, [status, challengeId, from, to, page]);

  // Page-reset is handled inline by each filter setter (see
  // `setStatusAndResetPage` etc. below) rather than via an effect, so
  // we never drive state in response to other state.
  function setStatusFilter(v: ClaimStatus | "all") {
    setStatus(v);
    setPage(0);
  }
  function setChallengeFilter(v: string) {
    setChallengeId(v);
    setPage(0);
  }
  function setFromFilter(v: string) {
    setFrom(v);
    setPage(0);
  }
  function setToFilter(v: string) {
    setTo(v);
    setPage(0);
  }

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter((r) => {
      const name = r.user?.display_name?.toLowerCase() ?? "";
      const code = r.verification_code?.toLowerCase() ?? "";
      const title = r.challenge?.title?.toLowerCase() ?? "";
      return name.includes(q) || code.includes(q) || title.includes(q);
    });
  }, [data.rows, query]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const hasFilters =
    status !== "all" ||
    challengeId !== "all" ||
    from !== "" ||
    to !== "" ||
    query.trim() !== "";

  function clearFilters() {
    setStatus("all");
    setChallengeId("all");
    setFrom("");
    setTo("");
    setQuery("");
    setPage(0);
  }

  function exportCsv() {
    const header = [
      "Completed at",
      "Status",
      "Traveler",
      "Challenge",
      "Reward",
      "Discount",
      "Verification code",
      "Verified at",
      "Rejection reason",
    ];
    const lines = filteredRows.map((r) => {
      const reward = r.reward?.title ?? "";
      const discount = formatDiscount(r.reward) ?? "";
      const rowVals = [
        r.completed_at ?? "",
        r.verification_status,
        r.user?.display_name ?? "Traveler",
        r.challenge?.title ?? "",
        reward,
        discount,
        r.verification_code ?? "",
        r.verified_at ?? "",
        r.rejection_reason ?? "",
      ];
      return rowVals.map(csvEscape).join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `traveltomo-claims-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!hasLoadedOnce) return <PageSkeleton variant="list" />;

  const hasChallenges = data.challenges.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Claim History</h1>
          <p className="text-zinc-400 mt-1">
            Every challenge a traveler has finished at your business &mdash;
            pending, claimed, or rejected.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/analytics">
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Analytics
            </Button>
          </Link>
          <Button
            onClick={exportCsv}
            disabled={filteredRows.length === 0}
            className="bg-red-600 hover:bg-red-700"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5 lg:col-span-2">
              <Label className="text-xs text-zinc-400">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Traveler name, code, or challenge..."
                  className="bg-zinc-800 border-zinc-700 text-white pl-9 h-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Status</Label>
              <Select
                value={status}
                onValueChange={(v: string | null) =>
                  setStatusFilter((v ?? "all") as ClaimStatus | "all")
                }
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-white">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Challenge</Label>
              <Select
                value={challengeId}
                onValueChange={(v: string | null) =>
                  setChallengeFilter(v ?? "all")
                }
                disabled={!hasChallenges}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white h-10">
                  <SelectValue placeholder="All challenges" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="all" className="text-white">
                    All challenges
                  </SelectItem>
                  {data.challenges.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-white">
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:col-span-1">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">From</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFromFilter(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">To</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setToFilter(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white h-10"
                />
              </div>
            </div>
          </div>
          {hasFilters && (
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="text-zinc-400 hover:text-white"
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Empty states */}
      {!hasChallenges ? (
        <EmptyState
          icon={<Sparkles className="h-6 w-6 text-zinc-500" />}
          title="No challenges yet"
          description="Create a travel challenge to start collecting completions from travelers."
          ctaHref="/admin/travel-challenges"
          ctaLabel="Create a Travel Challenge"
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={<Gift className="h-6 w-6 text-zinc-500" />}
          title={hasFilters ? "No claims match your filters" : "No claims yet"}
          description={
            hasFilters
              ? "Adjust or clear the filters to see more activity."
              : "Travelers haven't finished a challenge here yet. As soon as one does, it'll appear here with their verification code."
          }
        />
      ) : (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base flex items-center justify-between">
              <span>
                {filteredRows.length} of {data.total}
                <span className="text-zinc-500 font-normal">
                  {" "}
                  on this page
                </span>
              </span>
              <span className="text-xs font-normal text-zinc-500">
                Page {page + 1} of {totalPages}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredRows.map((row) => (
                <ClaimRowItem key={row.id} row={row} />
              ))}
            </div>

            {/* Pagination */}
            {data.total > PAGE_SIZE && (
              <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-4">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0 || pending}
                  className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-zinc-500">
                  Showing rows {page * PAGE_SIZE + 1}&ndash;
                  {Math.min(data.total, (page + 1) * PAGE_SIZE)} of {data.total}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page + 1 >= totalPages || pending}
                  className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// -------- Row component --------

function ClaimRowItem({ row }: { row: ClaimRow }) {
  const status = row.verification_status;
  const traveler = row.user?.display_name ?? "Traveler";
  const initials = (traveler[0] ?? "T").toUpperCase();
  const reward = row.reward;
  const discount = formatDiscount(reward);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-white">{traveler}</p>
            <Badge
              variant="outline"
              className={`flex items-center gap-1 text-[10px] ${STATUS_CLASS[status]}`}
            >
              {STATUS_ICON[status]}
              {STATUS_LABEL[status]}
            </Badge>
            {row.challenge?.xp_reward && row.challenge.xp_reward > 0 && (
              <Badge className="bg-green-600/20 text-green-300 text-[10px]">
                +{row.challenge.xp_reward} XP
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            <span className="text-zinc-200">{row.challenge?.title ?? "Challenge"}</span>
            {" "}
            &middot; {formatTimestamp(row.completed_at)}
          </p>

          {/* Reward + discount line */}
          {reward && (
            <p className="text-xs text-zinc-500 mt-1">
              Reward:{" "}
              <span className="text-zinc-300">
                {reward.title ?? "Reward"}
              </span>
              {discount ? ` (${discount})` : ""}
            </p>
          )}

          {/* Pending shows the code so merchants can reconcile manually */}
          {status === "pending" && row.verification_code && (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-yellow-900/60 bg-yellow-900/10 px-2.5 py-1.5 text-xs text-yellow-200">
              <span className="text-yellow-500">Code</span>
              <span className="font-mono font-semibold tracking-widest text-yellow-100">
                {row.verification_code}
              </span>
            </div>
          )}

          {/* Verified meta */}
          {status === "verified" && row.verified_at && (
            <p className="text-xs text-green-400/80 mt-1">
              Claimed {formatTimestamp(row.verified_at)}
              {row.reward_released ? " &middot; reward released" : ""}
            </p>
          )}

          {/* Rejected reason */}
          {status === "rejected" && row.rejection_reason && (
            <p className="text-xs text-red-400/80 mt-1">
              Reason: {row.rejection_reason}
            </p>
          )}
        </div>

        {/* Quick action: jump to completions screen when still pending */}
        {status === "pending" && (
          <Link href="/admin/completions" className="shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            >
              Review
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

// -------- helpers --------

function EmptyState({
  icon,
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 mb-3">
          {icon}
        </div>
        <p className="text-white font-medium">{title}</p>
        <p className="text-xs text-zinc-500 mt-1 max-w-md">{description}</p>
        {ctaHref && ctaLabel && (
          <Link href={ctaHref} className="mt-4">
            <Button className="bg-red-600 hover:bg-red-700">{ctaLabel}</Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function formatDiscount(
  reward: ClaimRow["reward"] | null | undefined
): string | null {
  if (!reward?.discount_type) return null;
  const value = reward.discount_value;
  switch (reward.discount_type) {
    case "percentage":
      return value != null ? `${value}% off` : "Percent discount";
    case "fixed":
      return value != null ? `?${value} off` : "Fixed discount";
    case "freebie":
      return "Freebie";
    default:
      return reward.discount_type;
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function csvEscape(value: string): string {
  if (value == null) return "";
  const needsQuote = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}
