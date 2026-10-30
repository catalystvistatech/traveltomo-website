"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getPlatformOverview, type PlatformOverview } from "@/lib/actions/overview";
import { BusinessesMap } from "@/components/dashboard/businesses-map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";

const ROLE_LABELS: Record<string, string> = {
  user: "Travelers",
  merchant: "Merchants",
  admin: "Admins",
  superadmin: "Superadmins",
};

const ROLE_SINGULAR: Record<string, string> = {
  user: "Traveler",
  merchant: "Merchant",
  admin: "Admin",
  superadmin: "Superadmin",
};

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  rejected: "bg-red-500/15 text-red-300 border-red-500/30",
  suspended: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Superadmin overview (also reachable at /superadmin): who's on the
 * platform, and where every business is on a map.
 */
export default function PlatformOverviewPage() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getPlatformOverview().then((r) => {
      if ("error" in r) setError(r.error);
      else setOverview(r.data);
    });
  }, []);

  const businesses = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = overview?.businesses ?? [];
    if (!q) return all;
    return all.filter((b) =>
      [b.name, b.city, b.merchant_name, b.merchant_email]
        .some((v) => v?.toLowerCase().includes(q))
    );
  }, [overview, search]);

  if (error) {
    return (
      <p className="text-sm text-red-300">
        {error === "Unauthorized" ? "This page is for superadmins." : error}
      </p>
    );
  }
  if (!overview) return <PageSkeleton variant="list" />;

  const stats = [
    { label: "All users", value: overview.totalUsers },
    ...Object.entries(ROLE_LABELS).map(([role, label]) => ({
      label,
      value: overview.roleCounts[role] ?? 0,
    })),
    { label: "New this week", value: overview.newUsersThisWeek },
    { label: "Businesses", value: overview.businesses.length },
    { label: "Live quests", value: overview.liveQuests },
  ];
  const unpinned = overview.businesses.filter((b) => b.latitude == null || b.longitude == null).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
        <p className="mt-1 text-zinc-400">
          Every user and business on Travel Tomo, and where the businesses are.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {stats.map((s) => (
          <Card key={s.label} className="border-zinc-800 bg-zinc-900">
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-zinc-400">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-white">Businesses</CardTitle>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, city or merchant"
            className="max-w-xs border-zinc-700 bg-zinc-950 text-white"
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <BusinessesMap businesses={businesses} selectedId={selectedId} onSelect={setSelectedId} />
          {unpinned > 0 && (
            <p className="text-xs text-zinc-500">
              {unpinned} {unpinned === 1 ? "business has" : "businesses have"} no location yet, so{" "}
              {unpinned === 1 ? "it isn't" : "they aren't"} on the map.
            </p>
          )}
          <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {businesses.length === 0 && (
              <p className="p-4 text-sm text-zinc-500">No businesses match.</p>
            )}
            {businesses.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedId(b.id)}
                className={`flex w-full items-center justify-between gap-4 p-3 text-left hover:bg-zinc-800/60 ${
                  selectedId === b.id ? "bg-zinc-800/60" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{b.name}</p>
                  <p className="truncate text-xs text-zinc-400">
                    {[b.city, b.merchant_name, b.merchant_email].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-zinc-400">
                    {b.live_quests} live {b.live_quests === 1 ? "quest" : "quests"}
                  </span>
                  <Badge variant="outline" className={STATUS_STYLES[b.verification_status] ?? ""}>
                    {b.verification_status}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-white">Newest users</CardTitle>
          <Link href="/admin/manage/users" className="text-sm text-red-400 hover:underline">
            All users
          </Link>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {overview.recentUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{u.display_name ?? "No name"}</p>
                  <p className="truncate text-xs text-zinc-400">{u.email ?? "No email"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-zinc-400">
                  {u.banned_at && <Badge variant="destructive">banned</Badge>}
                  <span>{ROLE_SINGULAR[u.role] ?? u.role}</span>
                  <span>{formatDate(u.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
