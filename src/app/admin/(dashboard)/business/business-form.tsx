"use client";

// Add / edit a business in four plain steps:
//   1. Find it on Google  -> fills name, address, map pin and type
//   2. The basics         -> type as big tap targets, optional description
//   3. When you're open   -> one-tap presets, custom table only if needed
//   4. Who can find you   -> distance chips instead of typing meters
// Contact details are optional and folded away.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  BedDouble,
  Check,
  Coffee,
  Copy,
  Hotel,
  Mountain,
  PawPrint,
  ShoppingBag,
  Sparkles,
  Store,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { upsertBusiness, submitBusinessForVerification } from "@/lib/actions/business";
import {
  ESTABLISHMENT_LABELS,
  ESTABLISHMENT_TYPES,
  type BusinessHoursInput,
  type EstablishmentType,
  type ExtendedBusinessInput,
} from "@/lib/validations/marketplace";
import { BusinessLocationPicker, type BusinessLocationValue } from "@/components/business-location-picker";
import { establishmentTypeFromCategory } from "@/lib/establishment";
import { MAX_SERVICE_RADIUS_M, MIN_SERVICE_RADIUS_M } from "@/lib/constants/service-radius";

const DAYS: (keyof BusinessHoursInput)[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const TYPE_ICONS: Record<EstablishmentType, LucideIcon> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  hotel: Hotel,
  motel: BedDouble,
  adventure: Mountain,
  bar: Wine,
  shop: ShoppingBag,
  spa: Sparkles,
  animal_themed: PawPrint,
  other: Store,
};

const REACH_OPTIONS = [
  { meters: 1000, title: "Walking distance", hint: "1 km" },
  { meters: 2000, title: "Neighborhood", hint: "2 km" },
  { meters: 5000, title: "Whole city", hint: "5 km" },
  { meters: 10000, title: "The region", hint: "10 km" },
];

type HoursPreset = "everyday" | "weekdays" | "custom";

function presetHours(preset: Exclude<HoursPreset, "custom">): BusinessHoursInput {
  const open = { open: "09:00", close: preset === "everyday" ? "22:00" : "18:00", closed: false };
  const closed = { open: "09:00", close: "18:00", closed: true };
  return Object.fromEntries(
    DAYS.map((d) => [d, preset === "weekdays" && (d === "saturday" || d === "sunday") ? closed : open])
  ) as BusinessHoursInput;
}

function detectPreset(hours: BusinessHoursInput): HoursPreset {
  const same = (a: BusinessHoursInput) => DAYS.every((d) => JSON.stringify(a[d]) === JSON.stringify(hours[d]));
  if (same(presetHours("everyday"))) return "everyday";
  if (same(presetHours("weekdays"))) return "weekdays";
  return "custom";
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
          {n}
        </span>
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          {hint && <p className="text-sm text-zinc-400">{hint}</p>}
        </div>
      </div>
      <div className="space-y-3 sm:pl-10">{children}</div>
    </section>
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
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition ${
        selected ? "border-red-500 bg-red-600/15 text-white" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
      }`}
    >
      {children}
    </button>
  );
}

export function BusinessForm({
  businessId,
  initialForm,
  initialStatus,
  onSaved,
  onCancel,
  isNew,
}: {
  businessId?: string;
  initialForm: ExtendedBusinessInput;
  initialStatus: string;
  onSaved: () => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [form, setForm] = useState<ExtendedBusinessInput>(initialForm);
  const [pending, startTransition] = useTransition();
  // The type is pre-filled from Google until the merchant picks one.
  const [typeTouched, setTypeTouched] = useState(!isNew);
  const [hoursPreset, setHoursPreset] = useState<HoursPreset>(() => detectPreset(initialForm.hours));
  const [customReach, setCustomReach] = useState(
    !REACH_OPTIONS.some((o) => o.meters === initialForm.service_radius_meters)
  );
  const located = !!(form.google_place_id || form.address?.trim());

  function setHours(day: keyof BusinessHoursInput, patch: Partial<BusinessHoursInput["monday"]>) {
    setForm((f) => ({ ...f, hours: { ...f.hours, [day]: { ...f.hours[day], ...patch } } }));
  }

  function chooseHoursPreset(preset: HoursPreset) {
    setHoursPreset(preset);
    if (preset !== "custom") setForm((f) => ({ ...f, hours: presetHours(preset) }));
  }

  function save(submitForReview: boolean) {
    startTransition(async () => {
      const result = await upsertBusiness(form, businessId, { submitForReview });
      if ("error" in result) {
        const err = result.error as Record<string, unknown>;
        const msg =
          "_form" in err
            ? (err._form as string[])[0]
            : (Object.values(err).flatMap((v) => v as string[])[0] ?? "Please check your answers and try again.");
        toast.error(msg);
        return;
      }
      toast.success(
        isNew
          ? submitForReview
            ? "Business added and sent for verification. We'll let you know when it's approved."
            : "Business added."
          : "Changes saved."
      );
      onSaved();
    });
  }

  async function submitExisting() {
    if (!businessId) return;
    const r = await submitBusinessForVerification(businessId);
    if ("error" in r) {
      toast.error(r.error as string);
      return;
    }
    toast.success("Sent for verification.");
    onSaved();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(isNew);
      }}
      className="space-y-4 pt-2"
    >
      <Step
        n={1}
        title="Find your business"
        hint="Search Google Maps — we'll fill in the address and map pin for you."
      >
        <BusinessLocationPicker
          value={{
            name: form.name,
            address: form.address,
            city: form.city,
            latitude: form.latitude,
            longitude: form.longitude,
            google_place_id: form.google_place_id ?? null,
          }}
          onChange={(patch: Partial<BusinessLocationValue>) => setForm((prev) => ({ ...prev, ...patch }))}
          onPick={(p) => {
            if (!typeTouched) {
              setForm((prev) => ({ ...prev, establishment_type: establishmentTypeFromCategory(p.category) }));
            }
          }}
        />
      </Step>

      <Step n={2} title="The basics">
        <div className="space-y-2">
          <Label className="text-zinc-300">Business name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder="e.g. Mala Malatang"
            className="h-11 border-zinc-700 bg-zinc-800 text-white"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">What kind of place is it?</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {ESTABLISHMENT_TYPES.map((t) => {
              const Icon = TYPE_ICONS[t];
              return (
                <Chip
                  key={t}
                  selected={form.establishment_type === t}
                  onClick={() => {
                    setTypeTouched(true);
                    setForm({ ...form, establishment_type: t });
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0 text-red-400" /> {ESTABLISHMENT_LABELS[t]}
                </Chip>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">
            Short description <span className="text-zinc-500">(optional)</span>
          </Label>
          <Textarea
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            placeholder="What should travelers know? e.g. Famous for spicy hotpot, family-friendly."
            className="border-zinc-700 bg-zinc-800 text-white"
          />
        </div>
      </Step>

      <Step n={3} title="When are you open?">
        <div className="flex flex-wrap gap-2">
          <Chip selected={hoursPreset === "everyday"} onClick={() => chooseHoursPreset("everyday")}>
            Every day · 9 AM–10 PM
          </Chip>
          <Chip selected={hoursPreset === "weekdays"} onClick={() => chooseHoursPreset("weekdays")}>
            Weekdays · 9 AM–6 PM
          </Chip>
          <Chip selected={hoursPreset === "custom"} onClick={() => chooseHoursPreset("custom")}>
            Set my own hours
          </Chip>
        </div>
        {hoursPreset === "custom" && (
          <div className="space-y-2">
            <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
              {DAYS.map((d) => {
                const h = form.hours[d];
                return (
                  <div key={d} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <span className="w-24 capitalize text-zinc-300">{d}</span>
                    <label className="flex items-center gap-2 text-zinc-400">
                      <input
                        type="checkbox"
                        checked={!h.closed}
                        onChange={(e) => setHours(d, { closed: !e.target.checked })}
                      />
                      Open
                    </label>
                    {!h.closed && (
                      <>
                        <Input
                          type="time"
                          value={h.open ?? ""}
                          onChange={(e) => setHours(d, { open: e.target.value })}
                          className="w-36 border-zinc-700 bg-zinc-800 text-white"
                          aria-label={`${d} opening time`}
                        />
                        <span className="text-zinc-500">to</span>
                        <Input
                          type="time"
                          value={h.close ?? ""}
                          onChange={(e) => setHours(d, { close: e.target.value })}
                          className="w-36 border-zinc-700 bg-zinc-800 text-white"
                          aria-label={`${d} closing time`}
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  hours: Object.fromEntries(DAYS.map((d) => [d, { ...f.hours.monday }])) as BusinessHoursInput,
                }))
              }
              className="gap-1.5 border-zinc-700 text-zinc-300"
            >
              <Copy className="h-4 w-4" /> Copy Monday to every day
            </Button>
          </div>
        )}
      </Step>

      <Step n={4} title="How far away can travelers see you?" hint="Your quests show up for travelers within this distance.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {REACH_OPTIONS.map((o) => (
            <Chip
              key={o.meters}
              selected={!customReach && form.service_radius_meters === o.meters}
              onClick={() => {
                setCustomReach(false);
                setForm({ ...form, service_radius_meters: o.meters });
              }}
            >
              <span>
                <span className="block">{o.title}</span>
                <span className="block text-xs text-zinc-400">{o.hint}</span>
              </span>
            </Chip>
          ))}
        </div>
        {customReach ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={MIN_SERVICE_RADIUS_M}
              max={MAX_SERVICE_RADIUS_M}
              step={100}
              value={form.service_radius_meters}
              onChange={(e) => setForm({ ...form, service_radius_meters: parseInt(e.target.value || "0") })}
              className="w-32 border-zinc-700 bg-zinc-800 text-white"
              aria-label="Distance in meters"
            />
            <span className="text-sm text-zinc-400">
              meters ({MIN_SERVICE_RADIUS_M}–{MAX_SERVICE_RADIUS_M})
            </span>
          </div>
        ) : (
          <button type="button" onClick={() => setCustomReach(true)} className="text-sm text-zinc-400 underline hover:text-white">
            Enter an exact distance
          </button>
        )}
      </Step>

      <details className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 sm:p-5" open={!isNew && !!(form.contact_email || form.contact_phone || form.website)}>
        <summary className="cursor-pointer font-semibold text-white">
          Contact details <span className="font-normal text-zinc-500">(optional)</span>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-zinc-300">Phone</Label>
            <Input
              value={form.contact_phone ?? ""}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              placeholder="0917 123 4567"
              className="border-zinc-700 bg-zinc-800 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-300">Email</Label>
            <Input
              type="email"
              value={form.contact_email ?? ""}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              className="border-zinc-700 bg-zinc-800 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-300">Website or Facebook page</Label>
            <Input
              type="url"
              placeholder="https://"
              value={form.website ?? ""}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="border-zinc-700 bg-zinc-800 text-white"
            />
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button
          type="submit"
          disabled={pending || !located || form.name.trim().length < 2}
          className="h-11 gap-2 bg-red-600 px-6 text-white hover:bg-red-700"
        >
          <Check className="h-4 w-4" />
          {pending ? "Saving…" : isNew ? "Add business & send for verification" : "Save changes"}
        </Button>
        {!isNew && (initialStatus === "unsubmitted" || initialStatus === "rejected") && (
          <Button type="button" variant="outline" onClick={submitExisting} className="h-11 border-zinc-700 text-zinc-200">
            Send for verification
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel} className="h-11 text-zinc-400 hover:text-white">
          Cancel
        </Button>
        {isNew && !located && <span className="text-sm text-zinc-500">Find your business in step 1 first.</span>}
      </div>
    </form>
  );
}
