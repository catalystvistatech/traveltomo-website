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

type Row = Awaited<ReturnType<typeof listPendingCompletions>>[number];

const STATUS_CLASS: Record<string, string> = {
  pending: "border-yellow-600 text-yellow-400",
  verified: "border-green-600 text-green-400",
  rejected: "border-red-600 text-red-400",
};

export default function CompletionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [pending, startTransition] = useTransition();

  async function reload() {
    setRows(await listPendingCompletions());
  }

  useEffect(() => {
    reload();
  }, []);

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

  const matches = codeInput
    ? rows.filter((r) => {
        const rec = r as Record<string, unknown>;
        const code = rec.verification_code as string | null;
        return code?.toLowerCase().includes(codeInput.toLowerCase());
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
            Scan or paste verification code
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Ask the user to show their code from the app, then verify below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="e.g. TT-VR-1a2b..."
            className="bg-zinc-800 border-zinc-700 text-white"
          />
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">
          Pending ? {pendingRows.length}
        </h2>
        <div className="space-y-3">
          {pendingRows.length === 0 && (
            <p className="text-zinc-500 text-sm">Nothing to verify right now.</p>
          )}
          {pendingRows.map((r) => {
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
      </div>

      {reviewedRows.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Recently reviewed
          </h2>
          <div className="space-y-2">
            {reviewedRows.slice(0, 10).map((r) => {
              const rec = r as Record<string, unknown>;
              const status = rec.verification_status as string;
              const ch = rec.challenges as Record<string, unknown> | null;
              return (
                <div
                  key={rec.id as string}
                  className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
                >
                  <span className="text-zinc-300">{ch?.title as string}</span>
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
        </div>
      )}
    </div>
  );
}
