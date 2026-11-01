import { Flag, Gift } from "lucide-react";

// A pixel-faithful copy of the quest card on the iOS Home screen
// (TravelTomo/Presentation/Screens/Main/Home/Components/HomeCards.swift,
// TravelChallengesCard), so merchants see exactly what travelers will see
// while they set a quest up.
//
// iOS: 220pt tall, 12pt corners, cover photo (or the blue→cyan
// GradientBackdrop when there is none) under a black→clear left fade,
// title / "Win: …" pill / business + city / red "Start Quest" capsule.

export function QuestAppCard({
  title,
  bigReward,
  businessName,
  city,
  coverUrl,
}: {
  title: string;
  bigReward?: string | null;
  businessName?: string | null;
  city?: string | null;
  coverUrl?: string | null;
}) {
  return (
    <div className="relative h-[220px] w-full overflow-hidden rounded-xl" aria-label="Preview of the quest card in the app">
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#4facfe] to-[#00f2fe]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 to-transparent" />

      <div className="relative flex h-full flex-col items-start gap-2.5 p-5">
        <p className="line-clamp-2 text-base font-semibold text-white">{title.trim() || "Your quest name"}</p>
        {bigReward?.trim() && (
          <span className="flex items-center gap-1.5 rounded-full bg-[#D12D34]/90 px-2.5 py-1.5 text-xs font-bold text-white">
            <Gift className="h-3 w-3" /> Win: {bigReward}
          </span>
        )}
        <div className="space-y-1 text-xs font-light text-white/85">
          {businessName && <p>{businessName}</p>}
          {city && <p>{city}</p>}
        </div>
        <span className="mt-auto flex items-center gap-1.5 rounded-full bg-[#D12D34] px-[22px] py-2.5 text-sm font-bold text-white">
          <Flag className="h-3 w-3 fill-white" /> Start Quest
        </span>
      </div>
    </div>
  );
}

/** The card inside a phone-width frame with a caption. */
export function QuestAppPreview(props: Parameters<typeof QuestAppCard>[0] & { hint?: string }) {
  const { hint, ...card } = props;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">How it looks in the app</p>
      <div className="mx-auto w-full max-w-[360px] rounded-[28px] border border-zinc-800 bg-black p-3">
        <p className="px-1 pb-2 text-sm font-semibold text-white">Quests</p>
        <QuestAppCard {...card} />
      </div>
      {hint && <p className="text-center text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
