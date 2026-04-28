"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  listTravelChallenges,
  reviewTravelChallenge,
} from "@/lib/actions/travelChallenges";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";

type Row = Record<string, unknown> & {
  id: string;
  title: string;
  status: string;
  challenges?: { count: number }[];
};

export default function ManageTravelChallengesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  async function reload() {
    setIsLoading(true);
    const data = (await listTravelChallenges()) as unknown as Row[];
    setRows(data.filter((r) => r.status === "pending_review"));
    setIsLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    listTravelChallenges().then((data) => {
      if (cancelled) return;
      setRows((data as unknown as Row[]).filter((r) => r.status === "pending_review"));
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) return <PageSkeleton variant="list" />;

  function handleReview(id: string, action: "approved" | "rejected") {
    startTransition(async () => {
      const r = await reviewTravelChallenge(id, action, notes[id]);
      if ("error" in r) {
        toast.error(r.error as string);
      } else {
        toast.success(
          action === "approved"
            ? "Travel challenge approved and live."
            : "Travel challenge rejected."
        );
        await reload();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Travel Challenge Reviews
        </h1>
        <p className="text-zinc-400 mt-1">
          Approve a parent travel challenge to also set all of its child
          challenges live for travelers.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ShieldCheck className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white">All clear</h3>
            <p className="text-zinc-400 mt-1">
              No travel challenges are pending review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const childCount = Array.isArray(r.challenges)
              ? (r.challenges[0]?.count ?? 0)
              : 0;
            return (
              <Card key={r.id} className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <CardTitle className="text-white">
                        {r.title as string}
                      </CardTitle>
                      <CardDescription className="text-zinc-400 line-clamp-2">
                        {(r.description as string) || "No description"}
                      </CardDescription>
                    </div>
                    <Badge className="bg-yellow-600/20 text-yellow-400 shrink-0">
                      pending review
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 text-sm sm:grid-cols-4">
                    <Field label="Child challenges" value={String(childCount)} />
                    <Field
                      label="Completion mode"
                      value={(r.completion_mode as string) ?? "any"}
                    />
                    <Field
                      label="Starts"
                      value={fmtDate(r.date_range_start as string | null)}
                    />
                    <Field
                      label="Ends"
                      value={fmtDate(r.date_range_end as string | null)}
                    />
                  </div>

                  {r.big_reward_title ? (
                    <div className="rounded-md bg-zinc-950 border border-zinc-800 p-3 text-sm">
                      <p className="text-zinc-500 text-xs mb-1">Big reward</p>
                      <p className="text-white font-medium">
                        {r.big_reward_title as string}
                      </p>
                      {r.big_reward_description ? (
                        <p className="text-zinc-400 mt-1">
                          {r.big_reward_description as string}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <Textarea
                    placeholder="Admin notes (optional)"
                    value={notes[r.id] ?? ""}
                    onChange={(e) =>
                      setNotes((p) => ({ ...p, [r.id]: e.target.value }))
                    }
                    rows={2}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => handleReview(r.id, "approved")}
                      disabled={pending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Approve & Publish
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleReview(r.id, "rejected")}
                      disabled={pending}
                      className="border-red-600 text-red-400 hover:bg-red-600/10"
                    >
                      Reject
                    </Button>
                    <Link
                      href={`/admin/travel-challenges/${r.id}`}
                      className="ml-auto self-center text-sm text-blue-400 hover:underline"
                    >
                      Inspect details ?
                    </Link>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-zinc-500">{label}</p>
      <p className="text-white">{value}</p>
    </div>
  );
}

function fmtDate(value: string | null): string {
  if (!value) return "?";
  return new Date(value).toLocaleDateString();
}
