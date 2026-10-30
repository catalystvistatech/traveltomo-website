"use client";

// One quest in the Quests list: what it is, whether travelers can play it
// right now, and the obvious next step for its state.

import Link from "next/link";
import { BookmarkPlus, CalendarDays, MapPin, Trash2, Trophy } from "lucide-react";
import { TRAVEL_CHALLENGE_STOP_COUNT } from "@/lib/validations/marketplace";
import { manilaToday, questState, type QuestWindow } from "@/lib/quest-window";

type Rec = Record<string, unknown>;

function shortDate(ymd: string) {
  const d = new Date(`${ymd}T00:00:00+08:00`);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });
}

function describeWindow(start: string | null, end: string | null, state: string) {
  if (state === "ended" && end) return `Ended ${shortDate(end)}`;
  if (state === "not_started" && start) return `Starts ${shortDate(start)}`;
  if (start && end) return `${shortDate(start)} – ${shortDate(end)}`;
  if (end) return `Until ${shortDate(end)}`;
  return "No end date";
}

export function QuestCard({
  rec,
  onSaveTemplate,
  onDelete,
}: {
  rec: Rec;
  onSaveTemplate: () => void;
  onDelete: () => void;
}) {
  const id = rec.id as string;
  const stops = (rec.challenges as { count: number }[] | undefined)?.[0]?.count ?? 0;
  const status = (rec.status as string | null) ?? "draft";
  const start = (rec.date_range_start as string | null) ?? null;
  const end = (rec.date_range_end as string | null) ?? null;
  const state = questState({ status, date_range_start: start, date_range_end: end } as QuestWindow, manilaToday());
  const needsStops = Math.max(TRAVEL_CHALLENGE_STOP_COUNT - stops, 0);
  const isDraft = status === "draft" || status === "rejected";

  const pill = isDraft
    ? { label: "Draft", cls: "bg-zinc-700 text-zinc-200" }
    : state === "playable"
      ? { label: "Live", cls: "bg-green-600/20 text-green-300" }
      : state === "ended"
        ? { label: "Ended", cls: "bg-amber-600/20 text-amber-300" }
        : state === "not_started"
          ? { label: `Starts ${start ? shortDate(start) : "soon"}`, cls: "bg-sky-600/20 text-sky-300" }
          : { label: status.replace("_", " "), cls: "bg-zinc-700 text-zinc-300" };

  const action = isDraft
    ? needsStops > 0
      ? { label: `Add ${needsStops} more stop${needsStops === 1 ? "" : "s"}`, primary: true }
      : { label: "Publish", primary: true }
    : state === "ended"
      ? { label: "Run it again", primary: true }
      : { label: "Open", primary: false };

  const description = (rec.description as string | null)?.trim();
  const bigReward = (rec.big_reward_title as string | null)?.trim();
  const cover = rec.cover_url as string | null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700 sm:flex-row sm:items-center">
      <Link href={`/admin/travel-challenges/${id}`} className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-800">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <Trophy className="h-7 w-7 text-zinc-600" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-white">{rec.title as string}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pill.cls}`}>{pill.label}</span>
          </div>
          {description && <p className="line-clamp-1 text-sm text-zinc-400">{description}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> {describeWindow(start, end, state)}
            </span>
            <span className={`flex items-center gap-1 ${needsStops > 0 ? "text-amber-400" : ""}`}>
              <MapPin className="h-3.5 w-3.5" /> {stops} of {TRAVEL_CHALLENGE_STOP_COUNT} stops
            </span>
            {bigReward && (
              <span className="flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5" /> {bigReward}
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href={`/admin/travel-challenges/${id}`}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            action.primary
              ? "bg-red-600 text-white hover:bg-red-700"
              : "border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          {action.label}
        </Link>
        <button
          type="button"
          onClick={onSaveTemplate}
          className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white"
          title="Save as a reusable template"
          aria-label="Save as a reusable template"
        >
          <BookmarkPlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
          title="Move to Trash"
          aria-label="Move to Trash"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
