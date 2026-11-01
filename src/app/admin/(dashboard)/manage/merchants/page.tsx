"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCurrentUser,
  getRoleManagementData,
  reviewMerchantRequest,
  updateUserRole,
  type UserRole,
} from "@/lib/actions/auth";
import { Users, Building2, Search, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";

type ManagedProfile = {
  id: string;
  role: UserRole;
  merchant_request_status: string | null;
  display_name: string | null;
  created_at: string;
  businesses?: Record<string, unknown>[];
};

const roleOptions: UserRole[] = ["user", "merchant", "admin", "superadmin"];

type RequestFilter = "all" | "pending" | "approved" | "rejected" | "suspended";
const requestFilters: { key: RequestFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "suspended", label: "Suspended" },
];

function roleBadgeClass(role: UserRole): string {
  switch (role) {
    case "superadmin":
      return "bg-purple-600/20 text-purple-300";
    case "admin":
      return "bg-blue-600/20 text-blue-300";
    case "merchant":
      return "bg-emerald-600/20 text-emerald-300";
    default:
      return "bg-zinc-700 text-zinc-300";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
      return "bg-green-600/20 text-green-400";
    case "pending":
      return "bg-yellow-600/20 text-yellow-400";
    case "rejected":
    case "suspended":
      return "bg-red-600/20 text-red-400";
    default:
      return "bg-zinc-700 text-zinc-300";
  }
}

export default function ManageMerchantsPage() {
  const [profilesList, setProfilesList] = useState<ManagedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewerRole, setViewerRole] = useState<UserRole>("user");
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("all");

  async function loadData() {
    setIsLoading(true);
    const [viewer, managed] = await Promise.all([
      getCurrentUser(),
      getRoleManagementData(),
    ]);

    if (viewer) setViewerRole(viewer.role);

    if (managed.error) {
      toast.error(managed.error);
    } else {
      setProfilesList((managed.data as ManagedProfile[]) ?? []);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const canReview = viewerRole === "admin" || viewerRole === "superadmin";
  const canManageRoles = viewerRole === "superadmin";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profilesList.filter((profile) => {
      const status = profile.merchant_request_status ?? "none";
      if (requestFilter !== "all" && status !== requestFilter) return false;
      if (!q) return true;
      const biz = (profile.businesses ?? [])[0] ?? null;
      const haystack = [
        profile.display_name,
        biz?.name,
        biz?.city,
        biz?.category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [profilesList, query, requestFilter]);

  if (isLoading) return <PageSkeleton variant="list" />;

  async function handleRoleChange(userId: string, role: UserRole) {
    setLoadingUserId(userId);
    const result = await updateUserRole(userId, role);
    setLoadingUserId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Role updated to ${role}.`);
    await loadData();
  }

  async function handleReview(
    userId: string,
    decision: "approved" | "rejected" | "suspended"
  ) {
    setLoadingUserId(userId);
    const result = await reviewMerchantRequest(userId, decision);
    setLoadingUserId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Merchant request ${decision}.`);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Merchants & Admins</h1>
        <p className="text-zinc-400 mt-1">
          Superadmins can change all roles. Admins and superadmins can manually
          verify merchants.
        </p>
      </div>

      {/* Toolbar: search + status filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, business, city..."
            className="bg-zinc-900 border-zinc-800 pl-9 text-white placeholder:text-zinc-500"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {requestFilters.map((f) => {
            const active = requestFilter === f.key;
            const count =
              f.key === "all"
                ? profilesList.length
                : profilesList.filter(
                    (p) => (p.merchant_request_status ?? "none") === f.key
                  ).length;
            return (
              <button
                key={f.key}
                onClick={() => setRequestFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-white text-zinc-900"
                    : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                {f.label}
                <span className={active ? "ml-1.5 text-zinc-500" : "ml-1.5 text-zinc-600"}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white">
              {profilesList.length === 0 ? "No merchants yet" : "No matches"}
            </h3>
            <p className="text-zinc-400 mt-1">
              {profilesList.length === 0
                ? "Merchants will appear here after they register."
                : "Try a different search or filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          {/* Column header (desktop) */}
          <div className="hidden md:grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
            <span>Merchant</span>
            <span className="w-28 text-center">Request</span>
            <span className="w-[260px] text-right">Actions</span>
          </div>

          <div className="divide-y divide-zinc-800">
            {filtered.map((profile) => {
              const businesses = (profile.businesses ?? []) as Record<
                string,
                unknown
              >[];
              const biz = businesses[0] ?? null;
              const requestStatus = profile.merchant_request_status ?? "none";
              const bizStatus =
                (biz?.verification_status as string | null) ?? null;
              const busy = loadingUserId === profile.id;
              const secondary = [
                biz?.name as string | undefined,
                biz?.city as string | undefined,
                biz?.category as string | undefined,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <div
                  key={profile.id}
                  className="grid grid-cols-1 gap-3 px-4 py-3 transition-colors hover:bg-zinc-900/40 md:grid-cols-[1fr_auto_auto] md:items-center md:gap-4"
                >
                  {/* Identity */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-white">
                        {profile.display_name ?? "No name"}
                      </span>
                      <Badge className={roleBadgeClass(profile.role)}>
                        {profile.role}
                      </Badge>
                      {bizStatus && (
                        <Badge className={statusBadgeClass(bizStatus)}>
                          biz: {bizStatus}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {secondary || "No business profile yet"}
                      <span className="text-zinc-600">
                        {" · joined "}
                        {new Date(profile.created_at).toLocaleDateString()}
                      </span>
                    </p>
                  </div>

                  {/* Request status */}
                  <div className="md:w-28 md:text-center">
                    <Badge className={statusBadgeClass(requestStatus)}>
                      {requestStatus}
                    </Badge>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-start gap-2 md:w-[260px] md:flex-nowrap md:justify-end">
                    {canReview && (
                      <Select
                        value=""
                        onValueChange={(value) =>
                          handleReview(
                            profile.id,
                            value as "approved" | "rejected" | "suspended"
                          )
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          disabled={busy}
                          className="border-zinc-700 bg-zinc-900 text-zinc-200"
                        >
                          <MoreHorizontal className="size-4" />
                          <span className="ml-1">Review</span>
                        </SelectTrigger>
                        <SelectContent align="end">
                          <SelectItem
                            value="approved"
                            disabled={requestStatus === "approved"}
                            className="text-green-400"
                          >
                            Approve
                          </SelectItem>
                          <SelectItem
                            value="rejected"
                            disabled={requestStatus === "rejected"}
                            className="text-red-400"
                          >
                            Reject
                          </SelectItem>
                          <SelectItem
                            value="suspended"
                            disabled={requestStatus === "suspended"}
                            className="text-orange-400"
                          >
                            Suspend
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {canManageRoles && (
                      <Select
                        value={profile.role}
                        onValueChange={(value) =>
                          handleRoleChange(profile.id, value as UserRole)
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          disabled={busy}
                          className="w-[120px] border-zinc-700 bg-zinc-900 text-zinc-200 capitalize"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                          {roleOptions.map((role) => (
                            <SelectItem
                              key={role}
                              value={role}
                              className="capitalize"
                            >
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {canManageRoles && (
                      <Button
                        size="sm"
                        variant="outline"
                        title="Manage business"
                        render={
                          <Link
                            href={`/admin/manage/merchants/${profile.id}`}
                          />
                        }
                        className="border-zinc-700 px-2 text-zinc-300 hover:bg-zinc-800"
                      >
                        <Building2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
