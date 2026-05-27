"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Gift, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  createLibraryReward,
  deleteLibraryReward,
  type RewardRow,
} from "@/lib/actions/rewards";

type Props = {
  initialLibrary: RewardRow[];
  initialLinked: RewardRow[];
};

const EMPTY_FORM = {
  title: "",
  description: "",
  discount_type: "freebie" as "percentage" | "fixed" | "freebie",
  discount_value: "",
  max_redemptions: "",
  expires_at: "",
};

export function RewardsView({ initialLibrary, initialLinked }: Props) {
  const router = useRouter();
  const [library] = useState(initialLibrary);
  const [linked] = useState(initialLinked);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  async function handleCreate() {
    setSaving(true);
    const r = await createLibraryReward({
      ...form,
      discount_value: form.discount_value ? parseFloat(form.discount_value) : undefined,
      max_redemptions: form.max_redemptions ? parseInt(form.max_redemptions) : undefined,
    });
    setSaving(false);
    if ("error" in r) {
      const messages = Object.values(r.error as Record<string, unknown>)
        .flatMap((v) => v as string[])
        .filter(Boolean);
      toast.error(messages[0] ?? "Could not create reward");
      return;
    }
    toast.success("Reward added to your library");
    setShowNew(false);
    setForm(EMPTY_FORM);
    startTransition(() => router.refresh());
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    const r = await deleteLibraryReward(id);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    toast.success("Reward deleted");
    startTransition(() => router.refresh());
  }

  const isEmpty = library.length === 0 && linked.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Rewards</h1>
          <p className="text-zinc-400 mt-1">
            Your reusable reward library. Pick from these when setting the
            big reward on a travel challenge.
          </p>
        </div>
        <Button
          onClick={() => setShowNew((v) => !v)}
          className="bg-red-600 hover:bg-red-700 text-white gap-2"
        >
          <Plus className="h-4 w-4" /> New Reward
        </Button>
      </div>

      {showNew && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">New Reward</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Free Iced Coffee"
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
                placeholder="What does the traveler get?"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-zinc-300">Type</Label>
                <Select
                  value={form.discount_type}
                  onValueChange={(v: string | null) =>
                    v &&
                    setForm({
                      ...form,
                      discount_type: v as typeof form.discount_type,
                    })
                  }
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="freebie">Freebie</SelectItem>
                    <SelectItem value="percentage">% discount</SelectItem>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Value</Label>
                <Input
                  type="number"
                  value={form.discount_value}
                  onChange={(e) =>
                    setForm({ ...form, discount_value: e.target.value })
                  }
                  placeholder={
                    form.discount_type === "freebie"
                      ? "(not used)"
                      : form.discount_type === "percentage"
                        ? "e.g. 10 (for 10%)"
                        : "e.g. 50"
                  }
                  disabled={form.discount_type === "freebie"}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-zinc-300">
                  Max redemptions (optional)
                </Label>
                <Input
                  type="number"
                  value={form.max_redemptions}
                  onChange={(e) =>
                    setForm({ ...form, max_redemptions: e.target.value })
                  }
                  placeholder="Leave blank for unlimited"
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Expires (optional)</Label>
                <Input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) =>
                    setForm({ ...form, expires_at: e.target.value })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleCreate}
                disabled={saving || !form.title.trim()}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {saving ? "Saving..." : "Save reward"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowNew(false);
                  setForm(EMPTY_FORM);
                }}
                className="text-zinc-400"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isEmpty ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Gift className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white">No rewards yet</h3>
            <p className="text-zinc-400 mt-1 text-center">
              Tap <span className="text-white">New Reward</span> to add one,
              or create a travel challenge - your rewards there land here
              too.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {library.length > 0 && (
            <RewardSection
              title="Library"
              subtitle="Reusable - pick when creating a travel challenge."
              rewards={library}
              onDelete={handleDelete}
            />
          )}
          {linked.length > 0 && (
            <RewardSection
              title="Linked to challenges"
              subtitle="Bound to a specific challenge stop. Edit via the challenge."
              rewards={linked}
            />
          )}
        </>
      )}
    </div>
  );
}

function RewardSection({
  title,
  subtitle,
  rewards,
  onDelete,
}: {
  title: string;
  subtitle: string;
  rewards: RewardRow[];
  onDelete?: (id: string, title: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
          {title}
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rewards.map((rw) => (
          <Card
            key={rw.id}
            className="bg-zinc-900 border-zinc-800 relative group"
          >
            <CardHeader className="flex flex-row items-start justify-between">
              <div className="space-y-1 min-w-0 flex-1">
                <CardTitle className="text-white truncate">{rw.title}</CardTitle>
                {rw.challenges && (
                  <p className="text-xs text-zinc-500">{rw.challenges.title}</p>
                )}
              </div>
              <Badge className="bg-zinc-700 text-zinc-200">
                {rw.discount_type}
              </Badge>
            </CardHeader>
            <CardContent>
              {rw.description && (
                <p className="text-sm text-zinc-400 mb-3">{rw.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                {rw.discount_value != null && (
                  <span>
                    {rw.discount_type === "percentage"
                      ? `${rw.discount_value}% off`
                      : rw.discount_type === "fixed"
                        ? `${rw.discount_value} off`
                        : "Freebie"}
                  </span>
                )}
                <span>
                  {rw.current_redemptions ?? 0}
                  {rw.max_redemptions != null ? ` / ${rw.max_redemptions}` : ""}{" "}
                  redeemed
                </span>
                {rw.challenges?.status && (
                  <Badge
                    className={
                      rw.challenges.status === "live"
                        ? "bg-green-600/20 text-green-400"
                        : "bg-zinc-700 text-zinc-300"
                    }
                  >
                    {rw.challenges.status.replace("_", " ")}
                  </Badge>
                )}
              </div>
            </CardContent>
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(rw.id, rw.title)}
                className="absolute top-3 right-3 p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
                title="Delete reward"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
