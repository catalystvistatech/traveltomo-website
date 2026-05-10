"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getBusinesses,
  upsertBusiness,
  submitBusinessForVerification,
  deleteBusiness,
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
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import {
  ESTABLISHMENT_LABELS,
  ESTABLISHMENT_TYPES,
  DEFAULT_HOURS,
  type EstablishmentType,
  type BusinessHoursInput,
  type ExtendedBusinessInput,
} from "@/lib/validations/marketplace";
import {
  BusinessLocationPicker,
  type BusinessLocationValue,
} from "@/components/business-location-picker";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Store } from "lucide-react";

const DAYS: (keyof BusinessHoursInput)[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  unsubmitted: { label: "Not submitted", className: "border-zinc-700 text-zinc-400" },
  pending: { label: "Pending review", className: "border-yellow-600 text-yellow-400" },
  approved: { label: "Approved", className: "border-green-600 text-green-400" },
  rejected: { label: "Rejected", className: "border-red-600 text-red-400" },
  suspended: { label: "Suspended", className: "border-red-700 text-red-500" },
};

type Business = Awaited<ReturnType<typeof getBusinesses>>[number];

function blankForm(): ExtendedBusinessInput {
  return {
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
    google_place_id: "",
  };
}

function businessToForm(biz: Record<string, unknown>): ExtendedBusinessInput {
  const et = (biz.establishment_type ?? biz.category ?? "restaurant") as EstablishmentType;
  return {
    name: (biz.name as string) ?? "",
    description: (biz.description as string) ?? "",
    address: (biz.address as string) ?? "",
    city: (biz.city as string) ?? "Angeles City",
    establishment_type: ESTABLISHMENT_TYPES.includes(et) ? et : "restaurant",
    latitude: (biz.latitude as number) ?? 15.143,
    longitude: (biz.longitude as number) ?? 120.586,
    service_radius_meters: (biz.service_radius_meters as number) ?? 2000,
    timezone: (biz.timezone as string) ?? "Asia/Manila",
    contact_email: (biz.contact_email as string) ?? "",
    contact_phone: (biz.contact_phone as string) ?? "",
    website: (biz.website as string) ?? "",
    hours: (biz.hours as BusinessHoursInput) ?? DEFAULT_HOURS,
    google_place_id: (biz.google_place_id as string) ?? "",
  };
}

function BusinessForm({
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

  function updateHours(day: keyof BusinessHoursInput, patch: Partial<BusinessHoursInput["monday"]>) {
    setForm({ ...form, hours: { ...form.hours, [day]: { ...form.hours[day], ...patch } } });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await upsertBusiness(form, businessId);
      if ("error" in result) {
        const err = result.error as Record<string, unknown>;
        const msg = "_form" in err
          ? (err._form as string[])[0]
          : (Object.values(err).flatMap((v) => v as string[])[0] ?? "Please check your inputs and try again.");
        toast.error(msg);
      } else {
        toast.success(isNew ? "Business created." : "Business saved.");
        onSaved();
      }
    });
  }

  async function handleSubmitForReview() {
    if (!businessId) return;
    const r = await submitBusinessForVerification(businessId);
    if ("error" in r) { toast.error(r.error as string); return; }
    toast.success("Submitted for verification.");
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
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
              v && setForm({ ...form, establishment_type: v as EstablishmentType })
            }
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTABLISHMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{ESTABLISHMENT_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">Description</Label>
        <Textarea
          value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          className="bg-zinc-800 border-zinc-700 text-white"
        />
      </div>

      <BusinessLocationPicker
        value={{
          name: form.name,
          address: form.address,
          city: form.city,
          latitude: form.latitude,
          longitude: form.longitude,
          google_place_id: form.google_place_id ?? null,
        }}
        onChange={(patch: Partial<BusinessLocationValue>) =>
          setForm((prev) => ({ ...prev, ...patch }))
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-zinc-300">Service Radius (m)</Label>
          <Input
            type="number"
            value={form.service_radius_meters}
            onChange={(e) =>
              setForm({ ...form, service_radius_meters: parseInt(e.target.value || "0") })
            }
            className="bg-zinc-800 border-zinc-700 text-white"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-zinc-300">Contact Email</Label>
          <Input
            type="email"
            value={form.contact_email ?? ""}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            className="bg-zinc-800 border-zinc-700 text-white"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">Contact Phone</Label>
          <Input
            value={form.contact_phone ?? ""}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            className="bg-zinc-800 border-zinc-700 text-white"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">Website</Label>
          <Input
            type="url"
            placeholder="https://"
            value={form.website ?? ""}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            className="bg-zinc-800 border-zinc-700 text-white"
          />
        </div>
      </div>

      <div className="pt-2">
        <h3 className="text-sm font-semibold text-white mb-3">Business Hours</h3>
        <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800">
          {DAYS.map((d) => {
            const h = form.hours[d];
            return (
              <div key={d} className="flex items-center gap-3 p-3 text-sm">
                <span className="w-24 capitalize text-zinc-300">{d}</span>
                <label className="flex items-center gap-2 text-zinc-400">
                  <input
                    type="checkbox"
                    checked={h.closed}
                    onChange={(e) => updateHours(d, { closed: e.target.checked })}
                  />
                  Closed
                </label>
                <Input
                  type="time"
                  value={h.open ?? ""}
                  disabled={h.closed}
                  onChange={(e) => updateHours(d, { open: e.target.value })}
                  className="w-28 bg-zinc-800 border-zinc-700 text-white"
                />
                <span className="text-zinc-500">–</span>
                <Input
                  type="time"
                  value={h.close ?? ""}
                  disabled={h.closed}
                  onChange={(e) => updateHours(d, { close: e.target.value })}
                  className="w-28 bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" disabled={pending} className="bg-red-600 hover:bg-red-700 text-white">
          {pending ? "Saving..." : isNew ? "Create Business" : "Save Changes"}
        </Button>
        {!isNew && (initialStatus === "unsubmitted" || initialStatus === "rejected") && (
          <Button
            type="button"
            variant="outline"
            onClick={handleSubmitForReview}
            className="border-zinc-700 text-zinc-200"
          >
            Submit for Verification
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="text-zinc-400 hover:text-white"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function BusinessPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | "new" | null>(null);
  const [deleteTransition, startDelete] = useTransition();

  async function reload() {
    setIsLoading(true);
    setBusinesses(await getBusinesses());
    setIsLoading(false);
  }

  useEffect(() => { reload(); }, []);

  if (isLoading) return <PageSkeleton variant="list" />;

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    startDelete(async () => {
      const r = await deleteBusiness(id);
      if (r.error) toast.error(r.error as string);
      else { toast.success("Business deleted."); await reload(); }
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Business Profiles</h1>
          <p className="text-zinc-400 mt-1">
            Manage your business listings. Each one can have its own challenges.
          </p>
        </div>
        <Button
          onClick={() => setExpandedId(expandedId === "new" ? null : "new")}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Business
        </Button>
      </div>

      {/* New business form */}
      {expandedId === "new" && (
        <Card className="bg-zinc-900 border-zinc-700">
          <CardHeader>
            <CardTitle className="text-white text-base">New Business</CardTitle>
          </CardHeader>
          <CardContent>
            <BusinessForm
              initialForm={blankForm()}
              initialStatus="unsubmitted"
              isNew
              onSaved={async () => { setExpandedId(null); await reload(); }}
              onCancel={() => setExpandedId(null)}
            />
          </CardContent>
        </Card>
      )}

      {/* Existing businesses */}
      {businesses.length === 0 && expandedId !== "new" && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Store className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white">No businesses yet</h3>
            <p className="text-zinc-400 mt-1 text-sm">
              Click &ldquo;Add Business&rdquo; to create your first listing.
            </p>
          </CardContent>
        </Card>
      )}

      {businesses.map((biz) => {
        const rec = biz as Record<string, unknown>;
        const id = rec.id as string;
        const status = (rec.verification_status as string) ?? "unsubmitted";
        const badge = STATUS_BADGE[status] ?? STATUS_BADGE.unsubmitted;
        const isOpen = expandedId === id;

        return (
          <Card key={id} className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-white truncate">{rec.name as string}</CardTitle>
                  <CardDescription className="text-zinc-500 text-xs mt-0.5">
                    {rec.city as string} · {rec.establishment_type as string}
                  </CardDescription>
                </div>
                <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setExpandedId(isOpen ? null : id)}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                  {isOpen
                    ? <ChevronUp className="h-3.5 w-3.5 ml-1.5" />
                    : <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
                  }
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deleteTransition}
                  onClick={() => handleDelete(id, rec.name as string)}
                  className="text-red-500 hover:text-red-400 hover:bg-red-900/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {isOpen && (
                <div className="mt-4 border-t border-zinc-800 pt-4">
                  <BusinessForm
                    businessId={id}
                    initialForm={businessToForm(rec)}
                    initialStatus={status}
                    isNew={false}
                    onSaved={async () => { setExpandedId(null); await reload(); }}
                    onCancel={() => setExpandedId(null)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
