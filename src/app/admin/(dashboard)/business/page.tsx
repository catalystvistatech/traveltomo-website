"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getBusinesses,
  deleteBusiness,
  getBusinessAccessState,
} from "@/lib/actions/business";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import { BusinessForm } from "./business-form";
import {
  ESTABLISHMENT_TYPES,
  DEFAULT_HOURS,
  type EstablishmentType,
  type BusinessHoursInput,
  type ExtendedBusinessInput,
} from "@/lib/validations/marketplace";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Store, Lock, Clock } from "lucide-react";

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

type AccessState = Awaited<ReturnType<typeof getBusinessAccessState>>;

export default function BusinessPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [access, setAccess] = useState<AccessState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | "new" | null>(null);
  const [deleteTransition, startDelete] = useTransition();

  async function reload() {
    setIsLoading(true);
    const [list, state] = await Promise.all([
      getBusinesses(),
      getBusinessAccessState(),
    ]);
    setBusinesses(list);
    setAccess(state);
    setIsLoading(false);
  }

  useEffect(() => { reload(); }, []);

  if (isLoading) return <PageSkeleton variant="list" />;

  const canWrite = access?.canWrite ?? false;

  // Pending merchants land here without write access. Show a locked
  // empty-state instead of the form so they can't bypass the gate and
  // hit a confusing toast on submit.
  if (!canWrite && access?.reason === "merchant_pending") {
    return <PendingApprovalLockout merchantStatus={access.merchantStatus} />;
  }

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
        {canWrite && (
          <Button
            onClick={() => setExpandedId(expandedId === "new" ? null : "new")}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Business
          </Button>
        )}
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

/**
 * Locked view shown to merchants whose `merchant_request_status` is
 * still anything other than `approved`. Without this, a freshly
 * signed-up merchant could fill in the form and submit a business for
 * verification before an admin had even reviewed them as a merchant --
 * the security red flag we landed on 2026-05-13.
 */
function PendingApprovalLockout({
  merchantStatus,
}: {
  merchantStatus: string | null;
}) {
  const isRejected = merchantStatus === "rejected";
  const isSuspended = merchantStatus === "suspended";

  const headline = isRejected
    ? "Merchant application rejected"
    : isSuspended
      ? "Merchant access suspended"
      : "Merchant approval pending";

  const description = isRejected
    ? "An admin reviewed your merchant application and was unable to approve it. Contact support for next steps."
    : isSuspended
      ? "Your merchant account is currently suspended. Reach out to support to restore access."
      : "An admin still has to approve your merchant application. Once they do, you'll be able to create your business profile and submit it for verification.";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Business Profiles</h1>
        <p className="text-zinc-400 mt-1">
          Manage your business listings. Each one can have its own challenges.
        </p>
      </div>
      <Card className="bg-yellow-600/10 border-yellow-600/40">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-600/20">
            {isRejected || isSuspended ? (
              <Lock className="h-6 w-6 text-yellow-300" />
            ) : (
              <Clock className="h-6 w-6 text-yellow-300" />
            )}
          </div>
          <h2 className="text-lg font-semibold text-white">{headline}</h2>
          <p className="max-w-md text-sm text-yellow-100/80">{description}</p>
          <p className="text-xs text-yellow-200/60">
            Current status: <span className="font-mono">{merchantStatus ?? "unknown"}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
