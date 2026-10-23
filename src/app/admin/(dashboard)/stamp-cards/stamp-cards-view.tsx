"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gift, Pause, Play, Printer, QrCode, ScanLine, Stamp, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createStampCard, setStampCardStatus, type StampCardRow } from "@/lib/actions/stampCards";
import { RedeemCodeBox } from "@/components/dashboard/redeem-code-box";

type Business = { id: string; name: string };

const STAMP_OPTIONS = [5, 6, 8, 10];
const FREEBIE_IDEAS = ["Free drink", "Free dessert", "Free meal", "Free coffee"];

export function StampCardsView({ cards, businesses }: { cards: StampCardRow[]; businesses: Business[] }) {
  const [showCreate, setShowCreate] = useState(cards.length === 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Stamp Cards</h1>
          <p className="mt-1 text-zinc-400">
            Bring travelers back. They scan your QR on every visit, and get a freebie when the card is full.
          </p>
        </div>
        {cards.length > 0 && !showCreate && (
          <Button onClick={() => setShowCreate(true)} className="gap-2 bg-red-600 text-white hover:bg-red-700">
            <Stamp className="h-4 w-4" /> New stamp card
          </Button>
        )}
      </div>

      <HowItWorks />
      <RedeemCodeBox />

      {showCreate && (
        <CreateCard businesses={businesses} onDone={() => setShowCreate(false)} canCancel={cards.length > 0} />
      )}

      {cards.map((card) => (
        <CardItem key={card.id} card={card} />
      ))}
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { icon: QrCode, title: "Print your QR", text: "Put it on the counter or table." },
    { icon: ScanLine, title: "Travelers scan it", text: "One stamp per visit, only when they're at your shop." },
    { icon: Gift, title: "Card full = freebie", text: "They show a code; type it in the box below and hand it over." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {steps.map((s, i) => (
        <div key={s.title} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600/20 text-sm font-bold text-red-300">
            {i + 1}
          </span>
          <div>
            <p className="flex items-center gap-1.5 font-semibold text-white">
              <s.icon className="h-4 w-4 text-red-400" /> {s.title}
            </p>
            <p className="text-sm text-zinc-400">{s.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CreateCard({
  businesses,
  onDone,
  canCancel,
}: {
  businesses: Business[];
  onDone: () => void;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? "");
  const business = businesses.find((b) => b.id === businessId);
  const [title, setTitle] = useState(business ? `${business.name} Stamp Card` : "");
  const [stamps, setStamps] = useState(6);
  const [freebie, setFreebie] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [pending, start] = useTransition();

  if (businesses.length === 0) {
    return (
      <Card className="border-zinc-800 bg-zinc-900">
        <CardContent className="py-8 text-center text-zinc-300">
          You need a verified business first.{" "}
          <Link href="/admin/business" className="text-red-400 hover:text-red-300">
            Go to Profile →
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardContent className="space-y-6 pt-6">
        <p className="text-lg font-semibold text-white">Make a stamp card</p>

        {businesses.length > 1 && (
          <div className="space-y-2">
            <Label className="text-zinc-300">Which business?</Label>
            <div className="flex flex-wrap gap-2">
              {businesses.map((b) => (
                <Chip
                  key={b.id}
                  selected={b.id === businessId}
                  onClick={() => {
                    setBusinessId(b.id);
                    if (!title.trim() || title === `${business?.name} Stamp Card`) setTitle(`${b.name} Stamp Card`);
                  }}
                >
                  {b.name}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-zinc-300">How many visits to fill the card?</Label>
          <div className="flex flex-wrap gap-2">
            {STAMP_OPTIONS.map((n) => (
              <Chip key={n} selected={stamps === n} onClick={() => setStamps(n)}>
                {n} stamps
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-zinc-300">When the card is full, they get…</Label>
          <div className="flex flex-wrap gap-2">
            {FREEBIE_IDEAS.map((idea) => (
              <Chip key={idea} selected={freebie === idea} onClick={() => setFreebie(idea)}>
                {idea}
              </Chip>
            ))}
          </div>
          <Input
            value={freebie}
            onChange={(e) => setFreebie(e.target.value)}
            placeholder="…or type your own"
            className="border-zinc-700 bg-zinc-800 text-white"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-zinc-300">Card name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="border-zinc-700 bg-zinc-800 text-white" />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-300">Last day (optional)</Label>
            <Input
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="border-zinc-700 bg-zinc-800 text-white"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            disabled={pending || freebie.trim().length < 3 || title.trim().length < 3}
            onClick={() =>
              start(async () => {
                const r = await createStampCard({ businessId, title, stampsRequired: stamps, rewardTitle: freebie, endsAt: endsAt || null });
                if ("error" in r) {
                  toast.error(r.error);
                  return;
                }
                toast.success("Stamp card is live! Print the QR below.");
                onDone();
                router.refresh();
              })
            }
            className="h-11 bg-red-600 px-6 text-white hover:bg-red-700"
          >
            {pending ? "Creating…" : "Create stamp card"}
          </Button>
          {canCancel && (
            <Button variant="outline" onClick={onDone} className="h-11 border-zinc-700 text-zinc-300">
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CardItem({ card }: { card: StampCardRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const ended = card.ended;
  const live = card.status === "active" && !ended;

  function setStatus(status: "active" | "paused" | "archived") {
    start(async () => {
      const r = await setStampCardStatus(card.id, status);
      if ("error" in r) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardContent className="flex flex-col gap-6 pt-6 sm:flex-row">
        <div className="w-full shrink-0 sm:w-44">
          <div
            className="rounded-lg bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
            // QR markup is generated server-side by the qrcode library from our own URL.
            dangerouslySetInnerHTML={{ __html: card.qr_svg }}
          />
          <Link
            href={`/admin/stamp-cards/${card.id}/poster`}
            target="_blank"
            className="mt-2 flex items-center justify-center gap-1.5 rounded-md border border-zinc-700 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            <Printer className="h-4 w-4" /> Print poster
          </Link>
        </div>

        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-bold text-white">{card.title}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                live ? "bg-green-600/20 text-green-300" : "bg-zinc-700 text-zinc-300"
              }`}
            >
              {live ? "Live" : ended ? "Ended" : "Paused"}
            </span>
          </div>
          <p className="text-zinc-400">
            {card.business_name} · {card.stamps_required} visits →{" "}
            <span className="font-medium text-zinc-200">{card.reward_title}</span>
            {card.ends_at && ` · until ${new Date(card.ends_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`}
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Collectors" value={card.stats.collectors} />
            <Stat label="Stamps this week" value={card.stats.stampsThisWeek} />
            <Stat label="Freebies earned" value={card.stats.freebiesEarned} />
            <Stat label="Freebies given" value={card.stats.freebiesGiven} />
          </div>

          <div className="flex flex-wrap gap-2">
            {card.status === "active" ? (
              <Button variant="outline" disabled={pending} onClick={() => setStatus("paused")} className="gap-1.5 border-zinc-700 text-zinc-300">
                <Pause className="h-4 w-4" /> Pause
              </Button>
            ) : (
              <Button variant="outline" disabled={pending} onClick={() => setStatus("active")} className="gap-1.5 border-zinc-700 text-zinc-300">
                <Play className="h-4 w-4" /> Resume
              </Button>
            )}
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (
                  confirm(
                    `Remove "${card.title}"? The printed QR stops working and travelers' progress on this card ends. Use Pause instead if you might bring it back.`
                  )
                ) {
                  setStatus("archived");
                }
              }}
              className="gap-1.5 border-zinc-700 text-zinc-400 hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-3">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-zinc-400">{label}</p>
    </div>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        selected ? "border-red-500 bg-red-600/20 text-white" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
      }`}
    >
      {children}
    </button>
  );
}
