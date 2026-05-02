"use client";

import { useCallback, useEffect, useRef, useState, use as unwrap } from "react";
import Link from "next/link";
import {
  getTravelChallenge,
  addChildChallenge,
  removeChildChallenge,
  submitTravelChallengeForReview,
  cloneTemplateIntoTravelChallenge,
} from "@/lib/actions/travelChallenges";
import { listPublishedTemplates } from "@/lib/actions/templates";
import { getBusiness } from "@/lib/actions/business";
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
import {
  ESTABLISHMENT_LABELS,
  ESTABLISHMENT_TYPES,
  WEEK_DAYS,
  type EstablishmentType,
} from "@/lib/validations/marketplace";
import { ArrowLeft, Plus, Trash2, FileStack, Send, Search, MapPin, Loader2 } from "lucide-react";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import type { PlacePrediction } from "@/components/business-location-picker";

type TravelChallenge = NonNullable<
  Awaited<ReturnType<typeof getTravelChallenge>>
>;
type Template = Awaited<ReturnType<typeof listPublishedTemplates>>[number];

const emptyChild = {
  title: "",
  description: "",
  instructions: "",
  type: "checkin" as "checkin" | "photo" | "qr" | "quiz",
  verification_type: "gps" as
    | "gps"
    | "qr_scan"
    | "photo_upload"
    | "quiz_answer",
  establishment_type: undefined as EstablishmentType | undefined,
  xp_reward: 50,
  radius_meters: 50,
  latitude: "",
  longitude: "",
  time_of_day_start: "",
  time_of_day_end: "",
  days_of_week: [1, 2, 3, 4, 5, 6, 7],
  max_completions: "",
  reward_title: "",
  reward_description: "",
  reward_discount_type: "percentage" as "percentage" | "fixed" | "freebie",
  reward_discount_value: "",
};

export default function TravelChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = unwrap(params);
  const [tc, setTc] = useState<TravelChallenge | null>(null);
  const [showChild, setShowChild] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [biz, setBiz] = useState<Record<string, unknown> | null>(null);
  const [child, setChild] = useState({ ...emptyChild });
  const [saving, setSaving] = useState(false);

  // --- Places search state (must be before any early return) ---
  const [placeQuery, setPlaceQuery] = useState("");
  const [placePredictions, setPlacePredictions] = useState<PlacePrediction[]>([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [showPlaceResults, setShowPlaceResults] = useState(false);
  const placeQueryRef = useRef(0);
  const placeContainerRef = useRef<HTMLDivElement>(null);

  async function reload() {
    setTc((await getTravelChallenge(id)) as TravelChallenge);
  }

  useEffect(() => {
    reload();
    listPublishedTemplates().then(setTemplates);
    getBusiness().then((b) => setBiz(b as Record<string, unknown> | null));
  }, [id]);

  useEffect(() => {
    const trimmed = placeQuery.trim();
    const reqId = ++placeQueryRef.current;
    if (trimmed.length < 2) {
      queueMicrotask(() => {
        if (reqId !== placeQueryRef.current) return;
        setPlacePredictions([]);
      });
      return;
    }
    const timeout = setTimeout(async () => {
      setPlaceSearching(true);
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (biz?.latitude != null && biz?.longitude != null) {
          params.set("lat", String(biz.latitude));
          params.set("lng", String(biz.longitude));
        }
        const res = await fetch(`/v1/places/autocomplete?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data?: PlacePrediction[] };
        if (reqId !== placeQueryRef.current) return;
        setPlacePredictions(json.data ?? []);
        setShowPlaceResults(true);
      } catch {
        if (reqId !== placeQueryRef.current) return;
        setPlacePredictions([]);
      } finally {
        if (reqId === placeQueryRef.current) setPlaceSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [placeQuery, biz]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (placeContainerRef.current && !placeContainerRef.current.contains(e.target as Node))
        setShowPlaceResults(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const handleSelectPlace = useCallback(
    (p: PlacePrediction) => {
      setChild((c) => ({
        ...c,
        title: c.title || p.name,
        latitude: String(p.lat),
        longitude: String(p.lng),
      }));
      setPlaceQuery("");
      setShowPlaceResults(false);
      setPlacePredictions([]);
    },
    []
  );

  if (!tc) return <PageSkeleton variant="list" />;

  const rec = tc as Record<string, unknown>;
  const children =
    ((rec.challenges as Record<string, unknown>[]) ?? []) ?? [];
  const status = rec.status as string;
  const MAX_STOPS = 6;
  const atStopLimit = children.length >= MAX_STOPS;

  function setDefaultsFromBiz() {
    if (biz) {
      setChild((c) => ({
        ...c,
        latitude: String(biz.latitude ?? ""),
        longitude: String(biz.longitude ?? ""),
      }));
    }
  }

  function toggleDay(day: number) {
    setChild((c) => {
      const exists = c.days_of_week.includes(day);
      return {
        ...c,
        days_of_week: exists
          ? c.days_of_week.filter((d) => d !== day)
          : [...c.days_of_week, day].sort(),
      };
    });
  }

  async function handleAddChild() {
    setSaving(true);
    const payload = {
      ...child,
      latitude: parseFloat(child.latitude),
      longitude: parseFloat(child.longitude),
      max_completions: child.max_completions
        ? parseInt(child.max_completions)
        : undefined,
      reward_discount_value: child.reward_discount_value
        ? parseFloat(child.reward_discount_value)
        : undefined,
    };
    const r = await addChildChallenge(id, payload);
    setSaving(false);
    if ("error" in r) {
      const err = r.error as Record<string, unknown>;
      toast.error(
        "_form" in err ? (err._form as string[])[0] : "Validation failed"
      );
      return;
    }
    toast.success("Challenge added");
    setShowChild(false);
    setChild({ ...emptyChild });
    await reload();
  }

  async function handleRemove(childId: string) {
    if (!confirm("Delete this challenge?")) return;
    const r = await removeChildChallenge(childId);
    if ("error" in r) toast.error(r.error as string);
    else {
      toast.success("Removed");
      await reload();
    }
  }

  async function handleSubmit() {
    const r = await submitTravelChallengeForReview(id);
    if ("error" in r) toast.error(r.error as string);
    else {
      toast.success("Travel challenge is now live!");
      await reload();
    }
  }

  async function handleClone(templateId: string) {
    if (!biz || biz.latitude == null || biz.longitude == null) {
      toast.error("Set business latitude/longitude first");
      return;
    }
    const t = templates.find((x) => (x as Record<string, unknown>).id === templateId);
    if (!t) return;
    const rec = t as Record<string, unknown>;
    const r = await cloneTemplateIntoTravelChallenge(id, templateId, {
      latitude: biz.latitude as number,
      longitude: biz.longitude as number,
      reward_title: `${rec.title as string} reward`,
      reward_discount_type: "percentage",
      reward_discount_value: 10,
    });
    if ("error" in r) {
      const err = r.error as Record<string, unknown>;
      toast.error(
        "_form" in err ? (err._form as string[])[0] : "Clone failed"
      );
      return;
    }
    toast.success("Template cloned ? edit the child challenge as needed");
    await reload();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/travel-challenges"
          className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">
              {rec.title as string}
            </h1>
            <Badge
              variant="outline"
              className="border-zinc-700 text-zinc-300 uppercase text-[10px]"
            >
              {status.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-zinc-400 mt-1">
            {(rec.description as string) ?? "--"}
          </p>
          <p className="text-xs text-zinc-500 mt-2">
            {(rec.completion_mode as string) === "any"
              ? "Completing any 1 challenge rewards the user."
              : "Completing all challenges unlocks the big reward."}
            {rec.date_range_start
              ? ` ? Runs ${rec.date_range_start} ? ${rec.date_range_end ?? "open"}`
              : ""}
            {rec.max_total_completions
              ? ` ? Cap ${rec.current_total_completions as number}/${rec.max_total_completions as number}`
              : ""}
          </p>
        </div>
        {(status === "draft" || status === "rejected") && (
          <Button
            onClick={handleSubmit}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            <Send className="h-4 w-4" /> Publish
          </Button>
        )}
      </div>

      <div className="flex gap-3 items-center">
        <Button
          onClick={() => {
            setShowChild((v) => !v);
            setDefaultsFromBiz();
          }}
          disabled={atStopLimit}
          className="bg-red-600 hover:bg-red-700 text-white gap-2"
        >
          <Plus className="h-4 w-4" /> Add Stop
        </Button>
        <span className="text-xs text-zinc-500">
          {children.length}/{MAX_STOPS} stops
        </span>
        <Button
          variant="outline"
          onClick={() => setShowTemplates((v) => !v)}
          className="border-zinc-700 text-zinc-200 gap-2"
        >
          <FileStack className="h-4 w-4" /> Clone from Template
        </Button>
      </div>

      {showTemplates && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-base">
              Template Library
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {templates.length === 0 && (
              <p className="text-zinc-500 text-sm">
                No templates published yet.
              </p>
            )}
            {templates.map((t) => {
              const tr = t as Record<string, unknown>;
              return (
                <div
                  key={tr.id as string}
                  className="flex items-center justify-between p-3 rounded-lg border border-zinc-800"
                >
                  <div>
                    <div className="font-medium text-white text-sm">
                      {tr.title as string}
                    </div>
                    <div className="text-xs text-zinc-400 line-clamp-1">
                      {tr.description as string}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleClone(tr.id as string)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white"
                  >
                    Clone
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {showChild && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-base">
              Add Challenge to this Set
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* --- Location search --- */}
            <div className="space-y-2" ref={placeContainerRef}>
              <Label className="text-zinc-300">Search for a location *</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={placeQuery}
                  onChange={(e) => setPlaceQuery(e.target.value)}
                  onFocus={() => {
                    if (placePredictions.length > 0) setShowPlaceResults(true);
                  }}
                  placeholder="e.g. Jollibee, Boracay Beach..."
                  className="bg-zinc-800 border-zinc-700 text-white pl-9 h-10"
                  autoComplete="off"
                />
                {placeSearching && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-500" />
                )}
              </div>
              {showPlaceResults && placePredictions.length > 0 && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 shadow-lg overflow-hidden z-50 relative">
                  {placePredictions.map((p) => (
                    <button
                      key={p.placeId}
                      type="button"
                      onClick={() => handleSelectPlace(p)}
                      className="flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-800"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">
                          {p.name}
                        </div>
                        {p.address && (
                          <div className="truncate text-xs text-zinc-400">
                            {p.address}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {child.latitude && child.longitude && (
                <p className="text-xs text-zinc-400">
                  📍 {parseFloat(child.latitude).toFixed(5)}, {parseFloat(child.longitude).toFixed(5)}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-zinc-300">Title *</Label>
                <Input
                  value={child.title}
                  onChange={(e) =>
                    setChild({ ...child, title: e.target.value })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Type</Label>
                <Select
                  value={child.type}
                  onValueChange={(v: string | null) =>
                    v &&
                    setChild({
                      ...child,
                      type: v as typeof child.type,
                    })
                  }
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checkin">Check-in</SelectItem>
                    <SelectItem value="photo">Photo</SelectItem>
                    <SelectItem value="qr">QR</SelectItem>
                    <SelectItem value="quiz">Quiz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Description *</Label>
              <Textarea
                rows={2}
                value={child.description}
                onChange={(e) =>
                  setChild({ ...child, description: e.target.value })
                }
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Radius (m)</Label>
              <Input
                type="number"
                value={child.radius_meters}
                onChange={(e) =>
                  setChild({
                    ...child,
                    radius_meters: parseInt(e.target.value || "0"),
                  })
                }
                placeholder="50"
                className="bg-zinc-800 border-zinc-700 text-white max-w-xs"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-zinc-300">Opens at</Label>
                <Input
                  type="time"
                  value={child.time_of_day_start}
                  onChange={(e) =>
                    setChild({
                      ...child,
                      time_of_day_start: e.target.value,
                    })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Closes at</Label>
                <Input
                  type="time"
                  value={child.time_of_day_end}
                  onChange={(e) =>
                    setChild({
                      ...child,
                      time_of_day_end: e.target.value,
                    })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Max completions</Label>
                <Input
                  type="number"
                  placeholder="unlimited"
                  value={child.max_completions}
                  onChange={(e) =>
                    setChild({
                      ...child,
                      max_completions: e.target.value,
                    })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Active days</Label>
              <div className="flex gap-2 flex-wrap">
                {WEEK_DAYS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`px-3 py-1 text-xs rounded-full border ${
                      child.days_of_week.includes(d.value)
                        ? "bg-red-600 border-red-600 text-white"
                        : "border-zinc-700 text-zinc-400"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-zinc-300">Establishment</Label>
                <Select
                  value={child.establishment_type ?? undefined}
                  onValueChange={(v: string | null) =>
                    setChild({
                      ...child,
                      establishment_type: (v ?? undefined) as
                        | EstablishmentType
                        | undefined,
                    })
                  }
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTABLISHMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ESTABLISHMENT_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">XP</Label>
                <Input
                  type="number"
                  value={child.xp_reward}
                  onChange={(e) =>
                    setChild({
                      ...child,
                      xp_reward: parseInt(e.target.value || "0"),
                    })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Verification</Label>
                <Select
                  value={child.verification_type}
                  onValueChange={(v: string | null) =>
                    v &&
                    setChild({
                      ...child,
                      verification_type: v as typeof child.verification_type,
                    })
                  }
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gps">GPS</SelectItem>
                    <SelectItem value="qr_scan">QR</SelectItem>
                    <SelectItem value="photo_upload">Photo</SelectItem>
                    <SelectItem value="quiz_answer">Quiz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800 space-y-3">
              <h4 className="text-sm font-semibold text-white">
                Reward for this challenge
              </h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Title *</Label>
                  <Input
                    value={child.reward_title}
                    onChange={(e) =>
                      setChild({ ...child, reward_title: e.target.value })
                    }
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Type *</Label>
                  <Select
                    value={child.reward_discount_type}
                    onValueChange={(v: string | null) =>
                      v &&
                      setChild({
                        ...child,
                        reward_discount_type:
                          v as typeof child.reward_discount_type,
                      })
                    }
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">% discount</SelectItem>
                      <SelectItem value="fixed">Fixed amount</SelectItem>
                      <SelectItem value="freebie">Freebie</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Value</Label>
                  <Input
                    type="number"
                    value={child.reward_discount_value}
                    onChange={(e) =>
                      setChild({
                        ...child,
                        reward_discount_value: e.target.value,
                      })
                    }
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleAddChild}
                disabled={saving}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {saving ? "Saving..." : "Add Challenge"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowChild(false)}
                className="text-zinc-400"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-base">
            Challenges in this set
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-zinc-800">
            {children.length === 0 && (
              <p className="text-zinc-500 text-sm">No challenges yet.</p>
            )}
            {children.map((c) => {
              const cr = c as Record<string, unknown>;
              return (
                <div
                  key={cr.id as string}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">
                        {cr.title as string}
                      </span>
                      <Badge
                        variant="outline"
                        className="border-zinc-700 text-zinc-400 text-[10px] uppercase"
                      >
                        {cr.status as string}
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      {cr.time_of_day_start
                        ? `${cr.time_of_day_start} ? ${cr.time_of_day_end as string}`
                        : "All day"}{" "}
                      ?{" "}
                      {cr.max_completions
                        ? `${cr.current_completions as number}/${cr.max_completions as number} used`
                        : "no cap"}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleRemove(cr.id as string)}
                    className="text-zinc-400 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
