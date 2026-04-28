"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listTravelChallenges,
  createTravelChallenge,
} from "@/lib/actions/travelChallenges";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";

type Row = Awaited<ReturnType<typeof listTravelChallenges>>[number];

const STATUS_CLASS: Record<string, string> = {
  draft: "border-zinc-700 text-zinc-400",
  pending_review: "border-yellow-600 text-yellow-400",
  approved: "border-green-600 text-green-400",
  live: "border-green-500 text-green-300",
  paused: "border-zinc-600 text-zinc-300",
  archived: "border-zinc-700 text-zinc-500",
  rejected: "border-red-600 text-red-400",
};

export default function TravelChallengesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    cover_url: "",
    completion_mode: "any" as "any" | "all",
    date_range_start: "",
    date_range_end: "",
    max_total_completions: "",
    big_reward_title: "",
    big_reward_description: "",
    big_reward_discount_type: "" as "" | "percentage" | "fixed" | "freebie",
    big_reward_discount_value: "",
  });

  async function reload() {
    setIsLoading(true);
    setRows(await listTravelChallenges());
    setIsLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  if (isLoading) return <PageSkeleton variant="list" />;

  async function handleCreate() {
    setSaving(true);
    const payload = {
      ...form,
      max_total_completions: form.max_total_completions
        ? parseInt(form.max_total_completions)
        : undefined,
      big_reward_discount_value: form.big_reward_discount_value
        ? parseFloat(form.big_reward_discount_value)
        : undefined,
      big_reward_discount_type: form.big_reward_discount_type || undefined,
    };
    const r = await createTravelChallenge(payload);
    setSaving(false);
    if ("error" in r) {
      const err = r.error as Record<string, unknown>;
      toast.error(
        "_form" in err ? (err._form as string[])[0] : "Validation failed"
      );
      return;
    }
    toast.success("Travel challenge created");
    setShowNew(false);
    await reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Travel Challenges</h1>
          <p className="text-zinc-400 mt-1">
            Bundle multiple challenges into a set. Complete any or all; merchants
            set the big-reward bonus.
          </p>
        </div>
        <Button
          onClick={() => setShowNew((v) => !v)}
          className="bg-red-600 hover:bg-red-700 text-white gap-2"
        >
          <Plus className="h-4 w-4" /> New Travel Challenge
        </Button>
      </div>

      {showNew && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">New Travel Challenge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-zinc-300">Completion Mode</Label>
                <Select
                  value={form.completion_mode}
                  onValueChange={(v: string | null) =>
                    v &&
                    setForm({
                      ...form,
                      completion_mode: v as "any" | "all",
                    })
                  }
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">
                      Any (1 done ? rewarded)
                    </SelectItem>
                    <SelectItem value="all">All (full set only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Start Date</Label>
                <Input
                  type="date"
                  value={form.date_range_start}
                  onChange={(e) =>
                    setForm({ ...form, date_range_start: e.target.value })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">End Date</Label>
                <Input
                  type="date"
                  value={form.date_range_end}
                  onChange={(e) =>
                    setForm({ ...form, date_range_end: e.target.value })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">
                Max total completions (optional)
              </Label>
              <Input
                type="number"
                value={form.max_total_completions}
                onChange={(e) =>
                  setForm({ ...form, max_total_completions: e.target.value })
                }
                placeholder="e.g. 100 ? closes after that many redemptions"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="pt-2 border-t border-zinc-800 space-y-3">
              <h3 className="text-sm font-semibold text-white">
                Big Reward (if completion mode = All)
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Big reward title</Label>
                  <Input
                    value={form.big_reward_title}
                    onChange={(e) =>
                      setForm({ ...form, big_reward_title: e.target.value })
                    }
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Type</Label>
                  <Select
                    value={form.big_reward_discount_type || undefined}
                    onValueChange={(v: string | null) =>
                      setForm({
                        ...form,
                        big_reward_discount_type: (v ?? "") as typeof form.big_reward_discount_type,
                      })
                    }
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder="(none)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">% discount</SelectItem>
                      <SelectItem value="fixed">Fixed amount</SelectItem>
                      <SelectItem value="freebie">Freebie</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Big reward description</Label>
                <Textarea
                  rows={2}
                  value={form.big_reward_description}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      big_reward_description: e.target.value,
                    })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Big reward value</Label>
                <Input
                  type="number"
                  value={form.big_reward_discount_value}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      big_reward_discount_value: e.target.value,
                    })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-3">
              <Button
                onClick={handleCreate}
                disabled={saving}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {saving ? "Creating..." : "Create"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowNew(false)}
                className="text-zinc-400"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {rows.map((tc) => {
          const rec = tc as Record<string, unknown>;
          const count = (rec.challenges as { count: number }[] | undefined)?.[0]
            ?.count ?? 0;
          const status = rec.status as string;
          return (
            <Link
              key={rec.id as string}
              href={`/admin/travel-challenges/${rec.id}`}
            >
              <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">
                          {rec.title as string}
                        </h3>
                        <Badge
                          variant="outline"
                          className={STATUS_CLASS[status] ?? STATUS_CLASS.draft}
                        >
                          {status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-sm text-zinc-400 line-clamp-2 mt-1">
                        {(rec.description as string) ?? "--"}
                      </p>
                      <p className="text-xs text-zinc-500 mt-2">
                        {count} challenge{count === 1 ? "" : "s"} ?{" "}
                        {(rec.completion_mode as string) === "any"
                          ? "Any wins"
                          : "Complete all"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {rows.length === 0 && (
          <p className="text-zinc-500 text-sm">
            No travel challenges yet. Create your first one above.
          </p>
        )}
      </div>
    </div>
  );
}
