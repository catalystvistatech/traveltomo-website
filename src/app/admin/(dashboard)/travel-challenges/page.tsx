"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  listTravelChallenges,
  createTravelChallenge,
  deleteTravelChallenge,
  restoreTravelChallenge,
  purgeTravelChallenge,
  listDeletedTravelChallenges,
  saveQuestAsTemplate,
  listQuestTemplates,
  createQuestFromTemplate,
  deleteQuestTemplate,
  uploadTravelChallengeCover,
  listMerchantBusinesses,
  listMerchantLibraryRewards,
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
import { Plus, ImagePlus, X, Trash2, BookmarkPlus, RotateCcw } from "lucide-react";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import { TRAVEL_CHALLENGE_STOP_COUNT } from "@/lib/validations/marketplace";

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

type LibraryReward = {
  id: string;
  title: string;
  description: string | null;
  discount_type: "percentage" | "fixed" | "freebie";
  discount_value: number | null;
};

/** yyyy-mm-dd for <input type="date">, in local time. */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Plain-English summary of the date range, e.g. "Runs Sep 26 → Oct 26
 * (30 days)". The native date input renders in the browser's locale
 * (mm/dd/yyyy on US-English machines), which is easy to misread in the
 * Philippines, so the chosen range is echoed back unambiguously.
 */
function describeRange(start: string, end: string): string {
  const fmt = (v: string) =>
    new Date(`${v}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  if (!start && !end) return "No dates set — the quest runs until you pause it.";
  if (start && !end) return `Starts ${fmt(start)}, no end date.`;
  if (!start && end) return `Ends ${fmt(end)}.`;
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  if (days < 0) return "The end date is before the start date.";
  return `Runs ${fmt(start)} → ${fmt(end)} (${days} day${days === 1 ? "" : "s"}).`;
}

export default function TravelChallengesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [businesses, setBusinesses] = useState<{ id: string; name: string; verification_status: string }[]>([]);
  const [libraryRewards, setLibraryRewards] = useState<LibraryReward[]>([]);
  const [deletedRows, setDeletedRows] = useState<Record<string, unknown>[]>([]);
  const [questTemplates, setQuestTemplates] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    cover_url: "",
    business_id: "",
    completion_mode: "any" as "any" | "all",
    date_range_start: "",
    date_range_end: "",
    max_total_completions: "",
    big_reward_source: "custom" as "library" | "custom",
    big_reward_reward_id: "",
    big_reward_save_to_library: false,
    big_reward_title: "",
    big_reward_description: "",
    big_reward_discount_type: "" as "" | "percentage" | "fixed" | "freebie",
    big_reward_discount_value: "",
  });

  async function reload() {
    setIsLoading(true);
    const [tcRows, bizList, rewards, deleted, templates] = await Promise.all([
      listTravelChallenges(),
      listMerchantBusinesses(),
      listMerchantLibraryRewards(),
      listDeletedTravelChallenges(),
      listQuestTemplates(),
    ]);
    setRows(tcRows);
    setBusinesses(bizList);
    setLibraryRewards(rewards);
    setDeletedRows(deleted as Record<string, unknown>[]);
    setQuestTemplates(templates as Record<string, unknown>[]);
    if (!form.business_id) {
      const approved = bizList.find((b) => b.verification_status === "approved");
      if (approved) setForm((f) => ({ ...f, business_id: approved.id }));
    }
    setIsLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  if (isLoading) return <PageSkeleton variant="list" />;

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const r = await uploadTravelChallengeCover(fd);
    setUploading(false);
    if ("error" in r) {
      toast.error(r.error as string);
      return;
    }
    const url = (r as { url: string }).url;
    setForm((f) => ({ ...f, cover_url: url }));
    setCoverPreview(URL.createObjectURL(file));
  }

  function formatActionError(err: Record<string, unknown>): string {
    if ("_form" in err) return (err._form as string[])[0];
    const messages = Object.values(err).flatMap((v) => v as string[]);
    return messages[0] ?? "Please check your inputs and try again.";
  }

  async function handleCreate() {
    setSaving(true);
    // When the merchant picked a library reward we only need to send
    // the id + source; the server copies the title/description/discount
    // out of the reward row itself. The inline fields are sent anyway
    // as a no-op fallback so the form stays simple.
    const payload = {
      ...form,
      max_total_completions: form.max_total_completions
        ? parseInt(form.max_total_completions)
        : undefined,
      big_reward_discount_value: form.big_reward_discount_value
        ? parseFloat(form.big_reward_discount_value)
        : undefined,
      big_reward_discount_type: form.big_reward_discount_type || undefined,
      big_reward_reward_id: form.big_reward_reward_id || undefined,
    };
    const r = await createTravelChallenge(payload);
    setSaving(false);
    if ("error" in r) {
      toast.error(formatActionError(r.error as Record<string, unknown>));
      return;
    }
    // Straight to adding stops: a quest can't go live until it has
    // TRAVEL_CHALLENGE_STOP_COUNT of them, and dropping the merchant back on
    // the list left them to work out that next step on their own.
    toast.success(`Quest created — now add ${TRAVEL_CHALLENGE_STOP_COUNT} stops`);
    setShowNew(false);
    const newId = (r as { id?: string }).id;
    if (newId) router.push(`/admin/travel-challenges/${newId}`);
    else await reload();
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Move "${title}" to Trash? You can restore it within 30 days, and a template copy is saved.`)) return;
    const r = await deleteTravelChallenge(id);
    if ("error" in r) toast.error(r.error as string);
    else {
      toast.success("Moved to Trash — restorable for 30 days");
      await reload();
    }
  }

  async function handleRestore(id: string) {
    const r = await restoreTravelChallenge(id);
    if ("error" in r) toast.error(r.error as string);
    else {
      toast.success("Restored as draft");
      await reload();
    }
  }

  async function handlePurge(id: string, title: string) {
    if (!confirm(`Permanently delete "${title}"? This cannot be undone.`)) return;
    const r = await purgeTravelChallenge(id);
    if ("error" in r) toast.error(r.error as string);
    else {
      toast.success("Permanently deleted");
      await reload();
    }
  }

  async function handleSaveTemplate(id: string) {
    const r = await saveQuestAsTemplate(id);
    if ("error" in r) toast.error(r.error as string);
    else {
      toast.success("Saved to your quest templates");
      await reload();
    }
  }

  async function handleUseTemplate(id: string) {
    const r = await createQuestFromTemplate(id);
    if ("error" in r) toast.error(formatActionError(r.error as Record<string, unknown>));
    else {
      toast.success("Quest created from template (draft)");
      await reload();
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm("Delete this quest template?")) return;
    const r = await deleteQuestTemplate(id);
    if ("error" in r) toast.error(r.error as string);
    else {
      toast.success("Template deleted");
      await reload();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Quests</h1>
          <p className="text-zinc-400 mt-1">
            A quest is a set of {TRAVEL_CHALLENGE_STOP_COUNT} places for travelers
            to visit. Name it, then pick the places.
          </p>
        </div>
        <Button
          onClick={() => {
            setShowNew((v) => !v);
            // Sensible default window so the merchant doesn't have to pick
            // dates at all: today → 30 days. Left alone if already set.
            setForm((f) =>
              f.date_range_start || f.date_range_end
                ? f
                : {
                    ...f,
                    date_range_start: isoDate(new Date()),
                    date_range_end: isoDate(new Date(Date.now() + 30 * 86_400_000)),
                  },
            );
          }}
          className="bg-red-600 hover:bg-red-700 text-white gap-2"
        >
          <Plus className="h-4 w-4" /> New Quest
        </Button>
      </div>

      {showNew && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">New Quest</CardTitle>
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
            <div className="space-y-2">
              <Label className="text-zinc-300">Header Photo</Label>
              {coverPreview || form.cover_url ? (
                <div className="relative w-full h-40 rounded-lg overflow-hidden border border-zinc-700">
                  <img
                    src={coverPreview ?? form.cover_url}
                    alt="Cover"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, cover_url: "" }));
                      setCoverPreview(null);
                    }}
                    className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white hover:bg-black/80"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 h-40 rounded-lg border-2 border-dashed border-zinc-700 hover:border-zinc-500 cursor-pointer transition-colors">
                  {uploading ? (
                    <p className="text-sm text-zinc-400">Uploading...</p>
                  ) : (
                    <>
                      <ImagePlus className="h-8 w-8 text-zinc-500" />
                      <p className="text-sm text-zinc-400">
                        Click to upload a cover image
                      </p>
                      <p className="text-xs text-zinc-600">Max 5 MB</p>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCoverUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              )}
            </div>

            {businesses.length > 1 && (
              <div className="space-y-2">
                <Label className="text-zinc-300">Business *</Label>
                <Select
                  value={form.business_id}
                  onValueChange={(v) => { if (v) setForm({ ...form, business_id: v }); }}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <span className="truncate">
                      {businesses.find((b) => b.id === form.business_id)?.name ?? "Select a business"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {businesses.filter((b) => b.verification_status === "approved").map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-500">Stops must be within this business&apos;s service area.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-zinc-300">How do travelers win?</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { value: "any", title: "Visit any stop", hint: "Each stop gives its own reward." },
                  { value: "all", title: "Visit every stop", hint: "Finishing all of them unlocks a big reward." },
                ] as const).map((opt) => {
                  const active = form.completion_mode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, completion_mode: opt.value })}
                      aria-pressed={active}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        active
                          ? "border-red-600 bg-red-600/10"
                          : "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
                      }`}
                    >
                      <p className="text-sm font-medium text-white">{opt.title}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{opt.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
            <p className="text-xs text-zinc-500 -mt-2">
              {describeRange(form.date_range_start, form.date_range_end)}
            </p>
            <div className="space-y-2">
              <Label className="text-zinc-300">
                Limit how many travelers can win (optional)
              </Label>
              <Input
                type="number"
                value={form.max_total_completions}
                onChange={(e) =>
                  setForm({ ...form, max_total_completions: e.target.value })
                }
                placeholder="Leave empty for no limit — e.g. 100 closes the quest after 100 winners"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            {/* The big reward only exists for "visit every stop" quests, so it
                is hidden otherwise instead of asking the merchant to fill in a
                section that cannot apply. */}
            {form.completion_mode === "all" && (
            <div className="pt-2 border-t border-zinc-800 space-y-3">
              <h3 className="text-sm font-semibold text-white">
                Big reward for finishing every stop
              </h3>

              {libraryRewards.length > 0 && (
              <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-800 p-0.5 text-xs">
                {(["library", "custom"] as const).map((mode) => {
                  const active = form.big_reward_source === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() =>
                        setForm({ ...form, big_reward_source: mode })
                      }
                      className={`px-3 py-1.5 rounded-md transition-colors ${
                        active
                          ? "bg-zinc-700 text-white"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {mode === "library"
                        ? `Pick from library (${libraryRewards.length})`
                        : "Custom"}
                    </button>
                  );
                })}
              </div>
              )}

              {form.big_reward_source === "library" ? (
                libraryRewards.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Your reward library is empty. Add one from the{" "}
                    <a
                      href="/admin/rewards"
                      className="text-red-400 hover:text-red-300 underline"
                    >
                      Rewards page
                    </a>{" "}
                    or switch to Custom to create one now.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Reward</Label>
                    <Select
                      value={form.big_reward_reward_id || undefined}
                      onValueChange={(v: string | null) => {
                        if (!v) return;
                        const picked = libraryRewards.find((r) => r.id === v);
                        setForm({
                          ...form,
                          big_reward_reward_id: v,
                          big_reward_title: picked?.title ?? "",
                          big_reward_description: picked?.description ?? "",
                          big_reward_discount_type:
                            (picked?.discount_type ?? "") as typeof form.big_reward_discount_type,
                          big_reward_discount_value:
                            picked?.discount_value?.toString() ?? "",
                        });
                      }}
                    >
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                        <SelectValue placeholder="Pick a reward" />
                      </SelectTrigger>
                      <SelectContent>
                        {libraryRewards.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.title}{" "}
                            {r.discount_type === "freebie"
                              ? "(freebie)"
                              : r.discount_value != null
                                ? `(${r.discount_value}${
                                    r.discount_type === "percentage" ? "%" : ""
                                  })`
                                : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              ) : (
                <>
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
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      checked={form.big_reward_save_to_library}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          big_reward_save_to_library: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-red-600 focus:ring-red-600"
                    />
                    Also save this reward to my Rewards library for reuse
                  </label>
                </>
              )}
            </div>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-zinc-800">
              <Button
                onClick={handleCreate}
                disabled={saving}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {saving ? "Creating..." : "Create & add stops →"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowNew(false)}
                className="text-zinc-400"
              >
                Cancel
              </Button>
              <p className="text-xs text-zinc-500 w-full sm:w-auto sm:ml-auto">
                Next: pick {TRAVEL_CHALLENGE_STOP_COUNT} places. The quest goes live once it has all{" "}
                {TRAVEL_CHALLENGE_STOP_COUNT}.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {rows.map((tc) => {
          const rec = tc as Record<string, unknown>;
          const count = (rec.challenges as { count: number }[] | undefined)?.[0]
            ?.count ?? 0;
          const status = ((rec.status as string | null) ?? "draft");
          return (
            <div key={rec.id as string} className="relative group">
              <Link href={`/admin/travel-challenges/${rec.id}`}>
                <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
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
                          <span className={count < TRAVEL_CHALLENGE_STOP_COUNT ? "text-amber-400" : undefined}>
                            {count} of {TRAVEL_CHALLENGE_STOP_COUNT} stops
                            {count < TRAVEL_CHALLENGE_STOP_COUNT &&
                              ` — add ${TRAVEL_CHALLENGE_STOP_COUNT - count} more to publish`}
                          </span>{" "}
                          ·{" "}
                          {(rec.completion_mode as string) === "any"
                            ? "Visit any stop"
                            : "Visit every stop"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSaveTemplate(rec.id as string);
                }}
                className="absolute top-3 right-12 p-2 rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
                title="Save as template"
              >
                <BookmarkPlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDelete(rec.id as string, rec.title as string);
                }}
                className="absolute top-3 right-3 p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
                title="Delete quest"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="text-zinc-500 text-sm">
            No quests yet. Create your first one above.
          </p>
        )}
      </div>

      {questTemplates.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">
            My Quest Templates
          </h2>
          <div className="grid gap-2">
            {questTemplates.map((t) => (
              <div
                key={t.id as string}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {t.title as string}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {(t.stop_count as number) ?? 0} stop
                    {(t.stop_count as number) === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => handleUseTemplate(t.id as string)}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Create quest
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteTemplate(t.id as string)}
                    className="border-zinc-700 text-zinc-400"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {deletedRows.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Recently deleted (restorable for 30 days)
          </h2>
          <div className="grid gap-2">
            {deletedRows.map((d) => (
              <div
                key={d.id as string}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-300 truncate">
                    {d.title as string}
                  </p>
                  <p className="text-xs text-zinc-600">
                    Deleted{" "}
                    {d.deleted_at
                      ? new Date(d.deleted_at as string).toLocaleDateString()
                      : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(d.id as string)}
                    className="border-zinc-700 text-zinc-200 gap-1"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePurge(d.id as string, d.title as string)}
                    className="border-red-800 text-red-400"
                  >
                    Delete forever
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
