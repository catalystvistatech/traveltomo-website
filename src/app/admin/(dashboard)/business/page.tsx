"use client";

import { useEffect, useState } from "react";
import {
  getBusiness,
  upsertBusiness,
  submitBusinessForVerification,
} from "@/lib/actions/business";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
  DEFAULT_HOURS,
  type EstablishmentType,
  type BusinessHoursInput,
  type ExtendedBusinessInput,
} from "@/lib/validations/marketplace";

const DAYS: (keyof BusinessHoursInput)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  unsubmitted: {
    label: "Not submitted",
    className: "border-zinc-700 text-zinc-400",
  },
  pending: {
    label: "Pending review",
    className: "border-yellow-600 text-yellow-400",
  },
  approved: {
    label: "Approved",
    className: "border-green-600 text-green-400",
  },
  rejected: {
    label: "Rejected",
    className: "border-red-600 text-red-400",
  },
  suspended: {
    label: "Suspended",
    className: "border-red-700 text-red-500",
  },
};

export default function BusinessPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("unsubmitted");
  const [form, setForm] = useState<ExtendedBusinessInput>({
    name: "",
    description: "",
    address: "",
    city: "Angeles City",
    establishment_type: "restaurant",
    latitude: 15.143,
    longitude: 120.586,
    service_radius_meters: 2000,
    timezone: "Asia/Manila",
    contact_email: "",
    contact_phone: "",
    website: "",
    hours: DEFAULT_HOURS,
  });

  useEffect(() => {
    getBusiness().then((biz) => {
      if (!biz) return;
      const rec = biz as Record<string, unknown>;
      setStatus((rec.verification_status as string) ?? "unsubmitted");
      const establishmentType = (rec.establishment_type ??
        rec.category ??
        "restaurant") as EstablishmentType;
      setForm({
        name: (rec.name as string) ?? "",
        description: (rec.description as string) ?? "",
        address: (rec.address as string) ?? "",
        city: (rec.city as string) ?? "Angeles City",
        establishment_type: ESTABLISHMENT_TYPES.includes(
          establishmentType as EstablishmentType
        )
          ? (establishmentType as EstablishmentType)
          : "restaurant",
        latitude: (rec.latitude as number) ?? 15.143,
        longitude: (rec.longitude as number) ?? 120.586,
        service_radius_meters:
          (rec.service_radius_meters as number) ?? 2000,
        timezone: (rec.timezone as string) ?? "Asia/Manila",
        contact_email: (rec.contact_email as string) ?? "",
        contact_phone: (rec.contact_phone as string) ?? "",
        website: (rec.website as string) ?? "",
        hours: ((rec.hours as BusinessHoursInput) ?? DEFAULT_HOURS) ?? DEFAULT_HOURS,
      });
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await upsertBusiness(form);
    setLoading(false);
    if ("error" in result) {
      const err = result.error as Record<string, unknown>;
      const msg =
        "_form" in err
          ? (err._form as string[])[0]
          : "Please check the form fields";
      toast.error(msg);
    } else {
      toast.success("Business profile saved");
      getBusiness().then((biz) => {
        if (biz)
          setStatus(
            ((biz as Record<string, unknown>).verification_status as string) ??
              status
          );
      });
    }
  }

  async function handleSubmitForReview() {
    const r = await submitBusinessForVerification();
    if ("error" in r) {
      toast.error(r.error as string);
      return;
    }
    setStatus("pending");
    toast.success("Submitted for verification");
  }

  function updateHours(
    day: keyof BusinessHoursInput,
    patch: Partial<BusinessHoursInput["monday"]>
  ) {
    setForm({ ...form, hours: { ...form.hours, [day]: { ...form.hours[day], ...patch } } });
  }

  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.unsubmitted;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Business Profile</h1>
          <p className="text-zinc-400 mt-1">
            Complete your business info and submit it for admin verification.
          </p>
        </div>
        <Badge variant="outline" className={badge.className}>
          {badge.label}
        </Badge>
      </div>

      {status === "rejected" && (
        <Card className="bg-red-600/10 border-red-900">
          <CardContent className="pt-6 text-red-200">
            Your business was rejected. Update the details and re-submit.
          </CardContent>
        </Card>
      )}

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Business Details</CardTitle>
          <CardDescription className="text-zinc-400">
            Shown to travelers in the app when your challenges are recommended.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-zinc-300">Business Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Type *</Label>
                <Select
                  value={form.establishment_type}
                  onValueChange={(v: string | null) =>
                    v &&
                    setForm({
                      ...form,
                      establishment_type: v as EstablishmentType,
                    })
                  }
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue />
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
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Description</Label>
              <Textarea
                value={form.description ?? ""}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={3}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-zinc-300">Address *</Label>
                <Input
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                  required
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">City *</Label>
                <Input
                  value={form.city}
                  onChange={(e) =>
                    setForm({ ...form, city: e.target.value })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-zinc-300">Latitude *</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={form.latitude}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      latitude: parseFloat(e.target.value || "0"),
                    })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Longitude *</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={form.longitude}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      longitude: parseFloat(e.target.value || "0"),
                    })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">
                  Service Radius (m)
                </Label>
                <Input
                  type="number"
                  value={form.service_radius_meters}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      service_radius_meters: parseInt(e.target.value || "0"),
                    })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>
            <p className="text-xs text-zinc-500 -mt-2">
              Your challenges must fall inside this radius of the business.
              Tip: paste coordinates from Google Maps.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-zinc-300">Contact Email</Label>
                <Input
                  type="email"
                  value={form.contact_email ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, contact_email: e.target.value })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Contact Phone</Label>
                <Input
                  value={form.contact_phone ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, contact_phone: e.target.value })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Website</Label>
                <Input
                  type="url"
                  placeholder="https://"
                  value={form.website ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, website: e.target.value })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>

            <div className="pt-4">
              <h3 className="text-sm font-semibold text-white mb-3">
                Business Hours
              </h3>
              <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                {DAYS.map((d) => {
                  const h = form.hours[d];
                  return (
                    <div
                      key={d}
                      className="flex items-center gap-3 p-3 text-sm"
                    >
                      <span className="w-24 capitalize text-zinc-300">
                        {d}
                      </span>
                      <label className="flex items-center gap-2 text-zinc-400">
                        <input
                          type="checkbox"
                          checked={h.closed}
                          onChange={(e) =>
                            updateHours(d, { closed: e.target.checked })
                          }
                        />
                        Closed
                      </label>
                      <Input
                        type="time"
                        value={h.open ?? ""}
                        disabled={h.closed}
                        onChange={(e) =>
                          updateHours(d, { open: e.target.value })
                        }
                        className="w-28 bg-zinc-800 border-zinc-700 text-white"
                      />
                      <span className="text-zinc-500">?</span>
                      <Input
                        type="time"
                        value={h.close ?? ""}
                        disabled={h.closed}
                        onChange={(e) =>
                          updateHours(d, { close: e.target.value })
                        }
                        className="w-28 bg-zinc-800 border-zinc-700 text-white"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-4">
              <Button
                type="submit"
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {loading ? "Saving..." : "Save Profile"}
              </Button>
              {(status === "unsubmitted" || status === "rejected") && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSubmitForReview}
                  className="border-zinc-700 text-zinc-200"
                >
                  Submit for Verification
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
