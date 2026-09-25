"use client";

// Three-step quest builder: prizes → pick places → publish. Everything a
// traveler never sees (dates, radius, XP, verification) gets a sensible
// default server-side; the full editor stays available for fine-tuning.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listMerchantBusinesses } from "@/lib/actions/travelChallenges";
import {
  createQuestWithWizard,
  listWizardPlaces,
  type WizardPlace,
} from "@/lib/actions/questWizard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Check, Gift, MapPin, Rocket, Trophy } from "lucide-react";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import { TRAVEL_CHALLENGE_STOP_COUNT } from "@/lib/validations/marketplace";

type Business = { id: string; name: string; verification_status: string };

const STOP_REWARD_IDEAS = ["Free drink", "Free dessert", "10% off", "Free snack"];
const BIG_REWARD_IDEAS = ["Free meal", "Free night's stay", "50% off", "Free souvenir"];

const STEPS = [
  { label: "Prizes", icon: Gift },
  { label: "Places", icon: MapPin },
  { label: "Publish", icon: Rocket },
] as const;

function formatDistance(m: number) {
  return m < 1000 ? `${m} m away` : `${(m / 1000).toFixed(1)} km away`;
}

export default function NewQuestWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [title, setTitle] = useState("");
  const [stopReward, setStopReward] = useState("");
  const [bigReward, setBigReward] = useState("");
  const [places, setPlaces] = useState<WizardPlace[] | null>(null);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    listMerchantBusinesses().then((list) => {
      const approved = list.filter((b) => b.verification_status === "approved");
      setBusinesses(approved);
      if (approved[0]) {
        setBusinessId(approved[0].id);
        setTitle(`${approved[0].name} Adventure`);
      }
      setIsLoading(false);
    });
  }, []);

  // Places depend only on the business; reload them when it changes.
  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    listWizardPlaces(businessId).then((r) => {
      if (cancelled) return;
      if ("error" in r) {
        setPlaces([]);
        setPlacesError(r.error);
      } else {
        setPlaces(r.places);
        setPlacesError(null);
      }
      setPicked([]);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const business = businesses.find((b) => b.id === businessId);
  const pickedPlaces = useMemo(
    () => picked.map((id) => places?.find((p) => p.id === id)).filter((p): p is WizardPlace => !!p),
    [picked, places],
  );
  const need = TRAVEL_CHALLENGE_STOP_COUNT;
  const prizesReady = title.trim().length >= 3 && stopReward.trim().length >= 3 && bigReward.trim().length >= 3;
  const placesReady = picked.length === need;

  function togglePlace(id: string) {
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= need) {
        toast.info(`You already picked ${need}. Tap one to remove it first.`);
        return cur;
      }
      return [...cur, id];
    });
  }

  async function publish() {
    setPublishing(true);
    const r = await createQuestWithWizard({
      businessId,
      title,
      stopReward: { title: stopReward, type: "freebie" },
      bigReward: { title: bigReward, type: "freebie" },
      placeIds: picked,
    });
    setPublishing(false);
    if ("success" in r) {
      toast.success("Your quest is live! Travelers can play it now.");
      router.push(`/admin/travel-challenges/${r.id}`);
      return;
    }
    toast.error(r.error);
    if (r.id) router.push(`/admin/travel-challenges/${r.id}`);
  }

  if (isLoading) return <PageSkeleton variant="list" />;

  if (businesses.length === 0) {
    return (
      <div className="max-w-2xl space-y-4">
        <BackLink />
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-white text-lg font-semibold">You need a verified business first</p>
            <p className="text-zinc-400">
              Quests start at your business. Once it&apos;s verified, come back here.
            </p>
            <Link href="/admin/profile" className="inline-block text-red-400 hover:text-red-300">
              Go to Profile →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <BackLink />
      <div>
        <h1 className="text-2xl font-bold text-white">Make a quest</h1>
        <p className="text-zinc-400 mt-1">Three quick steps. You can change anything later.</p>
      </div>

      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <li key={s.label} className="flex items-center gap-2 flex-1">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${
                  done
                    ? "bg-green-600 border-green-600 text-white"
                    : active
                      ? "border-red-500 text-red-400"
                      : "border-zinc-700 text-zinc-500"
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className={`text-sm font-medium ${active ? "text-white" : "text-zinc-500"}`}>
                {i + 1}. {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-zinc-800" />}
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="space-y-8 pt-6">
            {businesses.length > 1 && (
              <div className="space-y-2">
                <Label className="text-zinc-300 text-base">Which business is this for?</Label>
                <div className="flex flex-wrap gap-2">
                  {businesses.map((b) => (
                    <Chip
                      key={b.id}
                      selected={b.id === businessId}
                      onClick={() => {
                        setBusinessId(b.id);
                        if (!title.trim() || title === `${business?.name} Adventure`) {
                          setTitle(`${b.name} Adventure`);
                        }
                      }}
                    >
                      {b.name}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-zinc-300 text-base">Name your quest</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Coffee Crawl"
                className="bg-zinc-800 border-zinc-700 text-white h-12 text-lg"
              />
            </div>

            <RewardPicker
              icon={<Gift className="h-5 w-5 text-red-400" />}
              question="At each stop, travelers get…"
              ideas={STOP_REWARD_IDEAS}
              value={stopReward}
              onChange={setStopReward}
            />

            <RewardPicker
              icon={<Trophy className="h-5 w-5 text-yellow-400" />}
              question={`For finishing all ${need} stops, they win…`}
              ideas={BIG_REWARD_IDEAS}
              value={bigReward}
              onChange={setBigReward}
            />
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <p className="text-white text-lg font-semibold">
              Tap {need} places travelers should visit
            </p>
            <p className="text-zinc-400 text-sm">
              These are places near {business?.name ?? "your business"}. Pick fun ones — your own spot is a great first stop.
            </p>
          </div>
          {places === null ? (
            <PageSkeleton variant="list" />
          ) : placesError ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-8 text-center text-zinc-300">{placesError}</CardContent>
            </Card>
          ) : places.length < need ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-8 text-center space-y-2">
                <p className="text-zinc-300">
                  We only found {places.length} place{places.length === 1 ? "" : "s"} near this business — you need {need}.
                </p>
                <p className="text-zinc-500 text-sm">
                  Try a bigger service area on your Profile, or use the{" "}
                  <Link href="/admin/travel-challenges?advanced=1" className="text-red-400">
                    advanced editor
                  </Link>{" "}
                  to add stops by hand.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {places.map((p) => {
                const order = picked.indexOf(p.id);
                const selected = order >= 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlace(p.id)}
                    aria-pressed={selected}
                    className={`relative overflow-hidden rounded-xl border-2 text-left transition ${
                      selected
                        ? "border-red-500 ring-2 ring-red-500/40"
                        : "border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    <div className="aspect-[4/3] bg-zinc-800">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <MapPin className="h-8 w-8 text-zinc-600" />
                        </div>
                      )}
                    </div>
                    {selected && (
                      <span className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white font-bold shadow">
                        {order + 1}
                      </span>
                    )}
                    {p.isOwnBusiness && (
                      <span className="absolute top-2 left-2 rounded-full bg-green-600 px-2 py-0.5 text-xs font-semibold text-white">
                        Your place
                      </span>
                    )}
                    <div className="bg-zinc-900 p-2.5">
                      <p className="text-sm font-semibold text-white line-clamp-1">{p.name}</p>
                      <p className="text-xs text-zinc-400 line-clamp-1">
                        {p.category ? `${p.category} · ` : ""}
                        {formatDistance(p.distanceMeters)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="space-y-6 pt-6">
            <div>
              <p className="text-zinc-400 text-sm">Your quest</p>
              <p className="text-white text-2xl font-bold">{title}</p>
              <p className="text-zinc-400 text-sm mt-1">
                Runs for 30 days, starting today.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 p-4">
                <p className="text-zinc-400 text-sm flex items-center gap-2">
                  <Gift className="h-4 w-4 text-red-400" /> Every stop
                </p>
                <p className="text-white font-semibold mt-1">{stopReward}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 p-4">
                <p className="text-zinc-400 text-sm flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-400" /> Finish all {need}
                </p>
                <p className="text-white font-semibold mt-1">{bigReward}</p>
              </div>
            </div>
            <div>
              <p className="text-zinc-400 text-sm mb-2">The {need} stops</p>
              <ol className="space-y-2">
                {pickedPlaces.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-lg bg-zinc-800/60 px-3 py-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white text-sm font-bold">
                      {i + 1}
                    </span>
                    <span className="text-white">{p.name}</span>
                    <span className="ml-auto text-xs text-zinc-500">{formatDistance(p.distanceMeters)}</span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="text-zinc-500 text-sm">
              Travelers snap a photo at each stop, then show their QR code to claim the prize.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Sticky action bar: the one big button is always in the same place. */}
      <div className="sticky bottom-0 z-20 -mx-1 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          {step > 0 && (
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={publishing}
              className="border-zinc-700 text-zinc-300"
            >
              Back
            </Button>
          )}
          <span className="text-sm text-zinc-400">
            {step === 1 && `${picked.length} of ${need} picked`}
          </span>
          <div className="ml-auto">
            {step === 0 && (
              <Button
                onClick={() => setStep(1)}
                disabled={!prizesReady}
                className="bg-red-600 hover:bg-red-700 text-white h-11 px-6 text-base"
              >
                Next: pick places →
              </Button>
            )}
            {step === 1 && (
              <Button
                onClick={() => setStep(2)}
                disabled={!placesReady}
                className="bg-red-600 hover:bg-red-700 text-white h-11 px-6 text-base"
              >
                {placesReady ? "Next: review →" : `Pick ${need - picked.length} more`}
              </Button>
            )}
            {step === 2 && (
              <Button
                onClick={publish}
                disabled={publishing}
                className="bg-green-600 hover:bg-green-700 text-white h-11 px-6 text-base gap-2"
              >
                <Rocket className="h-4 w-4" />
                {publishing ? "Publishing…" : "Publish quest"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/travel-challenges"
      className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" /> All quests
    </Link>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        selected
          ? "border-red-500 bg-red-600/20 text-white"
          : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
      }`}
    >
      {children}
    </button>
  );
}

function RewardPicker({
  icon,
  question,
  ideas,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  question: string;
  ideas: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-zinc-300 text-base flex items-center gap-2">
        {icon} {question}
      </Label>
      <div className="flex flex-wrap gap-2">
        {ideas.map((idea) => (
          <Chip key={idea} selected={value === idea} onClick={() => onChange(idea)}>
            {idea}
          </Chip>
        ))}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="…or type your own"
        className="bg-zinc-800 border-zinc-700 text-white"
      />
    </div>
  );
}
