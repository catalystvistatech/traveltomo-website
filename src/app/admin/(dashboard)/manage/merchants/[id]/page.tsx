"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import {
  getBusinessesByMerchantId,
  upsertBusinessAsAdmin,
  reviewBusiness,
  deleteBusinessAsAdmin,
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, Trash2, ChevronDown, ChevronUp, Store } from "lucide-react";
import Link from "next/link";
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

const DAYS: (keyof BusinessHoursInput)[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const STATUS_OPTS = ["unsubmitted", "pending", "approved", "rejected", "suspended"] as const;

const STATUS_COLORS: Record<string, string> = {
  unsubmitted: "border-zinc-700 text-zinc-400",
  pending: "border-yellow-600 text-yellow-400",
  approved: "border-green-600 text-green-400",
  rejected: "border-red-600 text-red-400",
  suspended: "border-red-700 text-red-500",
};

type Business = Awaited<ReturnType<typeof getBusinessesByMerchantId>>[number];

function blankForm(): ExtendedBusinessInput {
  return {
    name: "", description: "", address: "", city: "Angeles City",
    establishment_type: "restaurant", latitude: 15.143, longitude: 120.586,
    service_radius_meters: 2000, timezone: "Asia/Manila",
    contact_email: "", contact_phone: "", website: "",
    hours: DEFAULT_HOURS, google_place_id: "",
  };
}

function toForm(rec: Record<string, unknown>): ExtendedBusinessInput {
  const et = (rec.establishment_type ?? rec.category ?? "restaurant") as EstablishmentType;
  return {
    name: (rec.name as string) ?? "",
    description: (rec.description as string) ?? "",
    address: (rec.address as string) ?? "",
    city: (rec.city as string) ?? "Angeles City",
    establishment_type: ESTABLISHMENT_TYPES.includes(et) ? et : "restaurant",
    latitude: (rec.latitude as number) ?? 15.143,
    longitude: (rec.longitude as number) ?? 120.586,
    service_radius_meters: (rec.service_radius_meters as number) ?? 2000,
    timezone: (rec.timezone as string) ?? "Asia/Manila",
    contact_email: (rec.contact_email as string) ?? "",
    contact_phone: (rec.contact_phone as string) ?? "",
    website: (rec.website as string) ?? "",
    hours: (rec.hours as BusinessHoursInput) ?? DEFAULT_HOURS,
    google_place_id: (rec.google_place_id as string) ?? "",
  };
}

function BusinessEditor({
  merchantId,
  businessId,
  initialForm,
  initialStatus,
  isNew,
  onSaved,
  onCancel,
}: {
  merchantId: string;
  businessId?: string;
  initialForm: ExtendedBusinessInput;
  initialStatus: string;
  isNew: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ExtendedBusinessInput>(initialForm);
  const [verificationStatus, setVerificationStatus] = useState(initialStatus);
  const [savePending, startSave] = useTransition();
  const [reviewPending, startReview] = useTransition();

  function updateHours(day: keyof BusinessHoursInput, patch: Partial<BusinessHoursInput["monday"]>) {
    setForm({ ...form, hours: { ...form.hours, [day]: { ...form.hours[day], ...patch } } });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startSave(async () => {
      const result = await upsertBusinessAsAdmin(
        merchantId,
        { ...form, verification_status: verificationStatus },
        businessId
      );
      if ("error" in result) {
        const err = result.error as Record<string, unknown>;
        toast.error("_form" in err ? (err._form as string[])[0] : "Check form fields");
      } else {
        toast.success(isNew ? "Business created." : "Business saved.");
        onSaved();
      }
    });
  }

  function handleVerdict(decision: "approved" | "rejected" | "suspended") {
    if (!businessId) return;
    startReview(async () => {
      const r = await reviewBusiness(businessId, decision);
      if ("error" in r) toast.error(r.error as string);
      else { toast.success(`Business ${decision}.`); setVerificationStatus(decision); onSaved(); }
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 pt-2">
      {/* Quick verdict buttons for existing businesses */}
      {!isNew && (
        <div className="flex flex-wrap gap-2 pb-2 border-b border-zinc-800">
          <Button size="sm" disabled={reviewPending || verificationStatus === "approved"}
            onClick={() => handleVerdict("approved")} type="button"
            className="bg-green-600 hover:bg-green-700 text-white">Approve</Button>
          <Button size="sm" variant="outline" disabled={reviewPending || verificationStatus === "rejected"}
            onClick={() => handleVerdict("rejected")} type="button"
            className="border-red-700 text-red-400 hover:bg-red-900/20">Reject</Button>
          <Button size="sm" variant="outline" disabled={reviewPending || verificationStatus === "suspended"}
            onClick={() => handleVerdict("suspended")} type="button"
            className="border-orange-700 text-orange-400 hover:bg-orange-900/20">Suspend</Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-zinc-300">Business Name *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            required className="bg-zinc-800 border-zinc-700 text-white" />
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">Type *</Label>
          <Select value={form.establishment_type}
            onValueChange={(v: string | null) =>
              v && setForm({ ...form, establishment_type: v as EstablishmentType })
            }>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
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
        <Textarea value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3} className="bg-zinc-800 border-zinc-700 text-white" />
      </div>

      <BusinessLocationPicker
        value={{
          name: form.name, address: form.address, city: form.city,
          latitude: form.latitude, longitude: form.longitude,
          google_place_id: form.google_place_id ?? null,
        }}
        onChange={(patch: Partial<BusinessLocationValue>) =>
          setForm((prev) => ({ ...prev, ...patch }))
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-zinc-300">Service Radius (m)</Label>
          <Input type="number" value={form.service_radius_meters}
            onChange={(e) => setForm({ ...form, service_radius_meters: parseInt(e.target.value || "0") })}
            className="bg-zinc-800 border-zinc-700 text-white" />
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">Verification Status (on save)</Label>
          <Select value={verificationStatus} onValueChange={(v) => { if (v) setVerificationStatus(v); }}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-zinc-300">Contact Email</Label>
          <Input type="email" value={form.contact_email ?? ""}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            className="bg-zinc-800 border-zinc-700 text-white" />
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">Contact Phone</Label>
          <Input value={form.contact_phone ?? ""}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            className="bg-zinc-800 border-zinc-700 text-white" />
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">Website</Label>
          <Input type="url" placeholder="https://" value={form.website ?? ""}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            className="bg-zinc-800 border-zinc-700 text-white" />
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
                  <input type="checkbox" checked={h.closed}
                    onChange={(e) => updateHours(d, { closed: e.target.checked })} />
                  Closed
                </label>
                <Input type="time" value={h.open ?? ""} disabled={h.closed}
                  onChange={(e) => updateHours(d, { open: e.target.value })}
                  className="w-28 bg-zinc-800 border-zinc-700 text-white" />
                <span className="text-zinc-500">-</span>
                <Input type="time" value={h.close ?? ""} disabled={h.closed}
                  onChange={(e) => updateHours(d, { close: e.target.value })}
                  className="w-28 bg-zinc-800 border-zinc-700 text-white" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" disabled={savePending} className="bg-red-600 hover:bg-red-700 text-white">
          {savePending ? "Saving..." : isNew ? "Create Business" : "Save Changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="text-zinc-400 hover:text-white">
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function MerchantBusinessManagePage() {
  const { id: merchantId } = useParams<{ id: string }>();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | "new" | null>(null);
  const [deletePending, startDelete] = useTransition();

  async function reload() {
    setIsLoading(true);
    setBusinesses(await getBusinessesByMerchantId(merchantId));
    setIsLoading(false);
  }

  useEffect(() => { reload(); }, [merchantId]);

  if (isLoading) return <PageSkeleton variant="list" />;

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    startDelete(async () => {
      const r = await deleteBusinessAsAdmin(id);
      if (r.error) toast.error(r.error as string);
      else { toast.success("Business deleted."); await reload(); }
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link href="/admin/manage/merchants" />}
          className="text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Merchants
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Merchant Businesses</h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Superadmin view - {businesses.length} business{businesses.length !== 1 ? "es" : ""} registered.
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
            <CardDescription className="text-zinc-400">
              Will be created on behalf of this merchant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BusinessEditor
              merchantId={merchantId}
              initialForm={blankForm()}
              initialStatus="unsubmitted"
              isNew
              onSaved={async () => { setExpandedId(null); await reload(); }}
              onCancel={() => setExpandedId(null)}
            />
          </CardContent>
        </Card>
      )}

      {businesses.length === 0 && expandedId !== "new" && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Store className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white">No businesses yet</h3>
            <p className="text-zinc-400 mt-1 text-sm">
              This merchant has not created any business profiles.
            </p>
          </CardContent>
        </Card>
      )}

      {businesses.map((biz) => {
        const rec = biz as Record<string, unknown>;
        const id = rec.id as string;
        const status = (rec.verification_status as string) ?? "unsubmitted";
        const isOpen = expandedId === id;

        return (
          <Card key={id} className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-white truncate">{rec.name as string}</CardTitle>
                  <CardDescription className="text-zinc-500 text-xs mt-0.5">
                    {rec.city as string} - {rec.establishment_type as string}
                  </CardDescription>
                </div>
                <Badge variant="outline" className={STATUS_COLORS[status] ?? STATUS_COLORS.unsubmitted}>
                  {status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  onClick={() => setExpandedId(isOpen ? null : id)}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                  {isOpen
                    ? <ChevronUp className="h-3.5 w-3.5 ml-1.5" />
                    : <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
                  }
                </Button>
                <Button size="sm" variant="ghost" disabled={deletePending}
                  onClick={() => handleDelete(id, rec.name as string)}
                  className="text-red-500 hover:text-red-400 hover:bg-red-900/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {isOpen && (
                <div className="mt-4 border-t border-zinc-800 pt-4">
                  <BusinessEditor
                    merchantId={merchantId}
                    businessId={id}
                    initialForm={toForm(rec)}
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
