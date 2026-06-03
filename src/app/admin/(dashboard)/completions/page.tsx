"use client";

import { useEffect, useState, useTransition } from "react";
import {
  listPendingCompletions,
  verifyCompletion,
  rejectCompletion,
} from "@/lib/actions/completions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";

type Row = Awaited<ReturnType<typeof listPendingCompletions>>[number];

const STATUS_CLASS: Record<string, string> = {
  pending: "border-yellow-600 text-yellow-400",
  verified: "border-green-600 text-green-400",
  rejected: "border-red-600 text-red-400",
};

const PAGE_SIZE = 8;

/** Pull the traveler's display name off an embedded profile, if present. */
function travelerName(rec: Record<string, unknown>): string {
  const u = rec.user as { display_name?: string | null } | null;
  const name = u?.display_name?.trim();
  return name && name.length > 0 ? name : "Unknown traveler";
}

function Paginator({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, from + PAGE_SIZE - 1);
  return (
    <div className="flex items-center justify-between mt-3 text-xs text-zinc-500">
      <span>
        {from}-{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 0}
          onClick={() => onPage(page - 1)}
          className="h-7 border-zinc-700 text-zinc-300 disabled:opacity-40"
        >
          Prev
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          className="h-7 border-zinc-700 text-zinc-300 disabled:opacity-40"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default function CompletionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [pendingPage, setPendingPage] = useState(0);
  const [reviewedPage, setReviewedPage] = useState(0);
  const [pending, startTransition] = useTransition();

  async function reload() {
    setIsLoading(true);
    setRows(await listPendingCompletions());
    setIsLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  if (isLoading) return <PageSkeleton variant="list" />;

  function handleVerify(id: string) {
    startTransition(async () => {
      const r = await verifyCompletion(id);
      if ("error" in r) toast.error(r.error as string);
      else {
        toast.success("Verified ? reward released");
        await reload();
      }
    });
  }

  function handleReject(id: string) {
    const reason = prompt("Why are you rejecting this completion?");
    if (!reason) return;
    startTransition(async () => {
      const r = await rejectCompletion(id, reason);
      if ("error" in r) toast.error(r.error as string);
      else {
        toast.success("Rejected");
        await reload();
      }
    });
  }

  const query = searchInput.trim().toLowerCase();
  const matches = query
    ? rows.filter((r) => {
        const rec = r as Record<string, unknown>;
        const code = (rec.verification_code as string | null)?.toLowerCase() ?? "";
        const name = travelerName(rec).toLowerCase();
        const title =
          ((rec.challenges as Record<string, unknown> | null)?.title as
            | string
            | null)?.toLowerCase() ?? "";
        return (
          code.includes(query) ||
          name.includes(query) ||
          title.includes(query)
        );
      })
    : rows;

  const pendingRows = matches.filter(
    (r) =>
      (r as Record<string, unknown>).verification_status === "pending"
  );
  const reviewedRows = matches.filter(
    (r) =>
      (r as Record<string, unknown>).verification_status !== "pending"
  );

  // Clamp + page the two lists. Pages are clamped so filtering down to a
  // smaller result set can't strand the view on an empty page.
  const pendingPageCount = Math.max(1, Math.ceil(pendingRows.length / PAGE_SIZE));
  const reviewedPageCount = Math.max(1, Math.ceil(reviewedRows.length / PAGE_SIZE));
  const safePendingPage = Math.min(pendingPage, pendingPageCount - 1);
  const safeReviewedPage = Math.min(reviewedPage, reviewedPageCount - 1);
  const pagedPending = pendingRows.slice(
    safePendingPage * PAGE_SIZE,
    safePendingPage * PAGE_SIZE + PAGE_SIZE
  );
  const pagedReviewed = reviewedRows.slice(
    safeReviewedPage * PAGE_SIZE,
    safeReviewedPage * PAGE_SIZE + PAGE_SIZE
  );

  function onSearchChange(value: string) {
    setSearchInput(value);
    setPendingPage(0);
    setReviewedPage(0);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Verify Completions</h1>
        <p className="text-zinc-400 mt-1">
          Confirm users actually completed your challenge before releasing the
          reward.
        </p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-base">
            Search by code or traveler name
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Paste the code the traveler shows you, or type their name to find
            their pending completion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="e.g. KG4D78 or Juan Dela Cruz"
            className="bg-zinc-800 border-zinc-700 text-white"
          />
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">
          Pending · {pendingRows.length}
        </h2>
        <div className="space-y-3">
          {pendingRows.length === 0 && (
            <p className="text-zinc-500 text-sm">
              {query
                ? "No pending completions match your search."
                : "Nothing to verify right now."}
            </p>
          )}
          {pagedPending.map((r) => {
            const rec = r as Record<string, unknown>;
            const ch = rec.challenges as Record<string, unknown> | null;
            const rewards = (ch?.rewards as Record<string, unknown>[]) ?? [];
            const reward = rewards[0];
            return (
              <Card
                key={rec.id as string}
                className="bg-zinc-900 border-zinc-800"
              >
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">
                          {(ch?.title as string) ?? "Challenge"}
                        </span>
                        <Badge
                          variant="outline"
                          className={STATUS_CLASS.pending}
                        >
                          pending
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-300 mt-1">
                        Traveler:{" "}
                        <span className="text-white">{travelerName(rec)}</span>
                      </p>
                      <p className="text-xs text-zinc-400 mt-1">
                        Code:{" "}
                        <span className="font-mono text-zinc-200">
                          {(rec.verification_code as string) ?? "--"}
                        </span>
                      </p>
                      {reward && (
                        <p className="text-xs text-zinc-500 mt-1">
                          Reward: {reward.title as string} (
                          {reward.discount_type as string}
                          {reward.discount_value
                            ? ` ${reward.discount_value}`
                            : ""}
                          )
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => handleVerify(rec.id as string)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        disabled={pending}
                        variant="outline"
                        onClick={() => handleReject(rec.id as string)}
                        className="border-red-700 text-red-400"
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <Paginator
          page={safePendingPage}
          pageCount={pendingPageCount}
          total={pendingRows.length}
          onPage={setPendingPage}
        />
      </div>

      {reviewedRows.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Recently reviewed · {reviewedRows.length}
          </h2>
          <div className="space-y-2">
            {pagedReviewed.map((r) => {
              const rec = r as Record<string, unknown>;
              const status = rec.verification_status as string;
              const ch = rec.challenges as Record<string, unknown> | null;
              return (
                <div
                  key={rec.id as string}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
                >
                  <div className="min-w-0">
                    <span className="text-zinc-300">{ch?.title as string}</span>
                    <span className="text-zinc-600"> · </span>
                    <span className="text-zinc-500">{travelerName(rec)}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={STATUS_CLASS[status] ?? STATUS_CLASS.pending}
                  >
                    {status}
                  </Badge>
                </div>
              );
            })}
          </div>
          <Paginator
            page={safeReviewedPage}
            pageCount={reviewedPageCount}
            total={reviewedRows.length}
            onPage={setReviewedPage}
          />
        </div>
      )}
    </div>
  );
}
